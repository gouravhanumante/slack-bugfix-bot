import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { BugDetails } from "../azure/workItems";

export interface AgentResult {
  summary: string;
  success: boolean;
  toolCallCount: number;
}

type ProgressCallback = (message: string) => Promise<void>;

const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || "600000", 10); // 10 min default

interface CursorCliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  result: string;
  session_id: string;
}

function buildBugContext(bug: BugDetails): string {
  const imageAttachments = bug.attachments.filter((a) => a.base64);
  const textAttachments = bug.attachments.filter((a) => a.content);
  const sections = [
    `# Bug #${bug.id}: ${bug.title}`,
    "",
    "## Bot Handoff",
    "This ticket packet was prepared by the Slack bug-fix bot before invoking Cursor Agent.",
    "Use it as your starting context, then gather extra evidence only if you need it and the tools are available.",
    "",
    "## Description",
    bug.description || "No description provided.",
    "",
    "## Reproduction Steps",
    bug.reproSteps || "No repro steps provided.",
    "",
    "## Acceptance Criteria",
    bug.acceptanceCriteria || "No acceptance criteria provided.",
  ];

  if (textAttachments.length > 0) {
    sections.push("", "## Attachments");
    for (const att of textAttachments) {
      sections.push(`### ${att.name}`, "```", att.content!, "```");
    }
  }

  if (imageAttachments.length > 0) {
    sections.push("", "## Image Attachments");
    for (const att of imageAttachments) {
      sections.push(`- ${att.name} (${att.mimeType})`);
    }
  }

  return sections.join("\n");
}

function buildExecutionPrompt(bug: BugDetails): string {
  return [
    `You are fixing Azure DevOps bug #${bug.id}: ${bug.title}.`,
    "",
    "Start by reading `_bug-context.md`. That file contains the ticket packet prepared by the orchestrator.",
    "",
    "Workflow requirements:",
    "- If workspace skills are available, follow `ticket-context-gathering`, `bugfix-workflow`, `lost-fix-detection` for reopened bugs, `systematic-debugging`, and `verification-before-completion`.",
    "- If those skills are not available in this workspace, follow the same intent manually: gather ticket context first, investigate before fixing, find the root cause, and verify before claiming success.",
    "- Treat `_bug-context.md` as the initial source of truth. If Azure DevOps comments/history are accessible in this environment, gather them before coding when they would materially change the investigation.",
    "- Trace the relevant data flow and check git history when useful. If the bug appears reopened or previously fixed, look for a lost or reverted fix before changing code.",
    "",
    "Operating constraints:",
    "- You are already inside the correct isolated git worktree prepared by the bot. Stay on the current branch and current worktree.",
    "- Do not create or switch branches.",
    "- Do not commit, push, or create a pull request. The Slack bot handles that after your work is done.",
    "- Do not modify spec files, API contracts, test/spec fixtures, or design documents.",
    "- Make the smallest focused production-code change that fixes this bug.",
    "- Preserve the existing code style and architecture. Avoid unrelated cleanup.",
    "",
    "End goal:",
    "- Leave the worktree with only the code changes needed for this bug.",
    "- If you cannot confidently complete the fix, stop and explain exactly what blocked you.",
    "",
    "Final response format:",
    "Root cause: ...",
    "Changes: ...",
    "Verification: ...",
    "Files modified: ...",
    "Risks / follow-up: ...",
  ].join("\n");
}

export async function runAgent(
  workDir: string,
  bug: BugDetails,
  onProgress?: ProgressCallback
): Promise<AgentResult> {
  const contextFile = path.join(workDir, "_bug-context.md");

  try {
    fs.writeFileSync(contextFile, buildBugContext(bug), "utf-8");

    if (onProgress) {
      await onProgress("Cursor agent is analyzing the codebase...");
    }

    const prompt = buildExecutionPrompt(bug);

    const result = await runCursorCli(workDir, prompt);

    if (result.is_error) {
      cleanup(contextFile);
      return {
        summary: result.result || "Agent encountered an error",
        success: false,
        toolCallCount: 0,
      };
    }

    if (onProgress) {
      await onProgress("Cursor agent completed — reviewing changes...");
    }

    return {
      summary: result.result || "Fix applied (no summary provided).",
      success: true,
      toolCallCount: 0,
    };
  } catch (err) {
    cleanup(contextFile);
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: `Cursor agent failed: ${message}`,
      success: false,
      toolCallCount: 0,
    };
  }
}

export async function runRepairAgent(
  workDir: string,
  bugId: number,
  bugTitle: string,
  failedStep: string,
  failureReport: string
): Promise<AgentResult> {
  const reportFile = path.join(workDir, "_verification-report.md");

  try {
    fs.writeFileSync(reportFile, failureReport, "utf-8");

    const prompt = buildRepairPrompt(bugId, bugTitle, failedStep);
    const result = await runCursorCli(workDir, prompt);

    cleanup(reportFile);

    if (result.is_error) {
      return {
        summary: result.result || "Repair agent encountered an error",
        success: false,
        toolCallCount: 0,
      };
    }

    return {
      summary: result.result || "Repair applied.",
      success: true,
      toolCallCount: 0,
    };
  } catch (err) {
    cleanup(reportFile);
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: `Repair agent failed: ${message}`,
      success: false,
      toolCallCount: 0,
    };
  }
}

function buildRepairPrompt(bugId: number, bugTitle: string, failedStep: string): string {
  return [
    `You previously fixed Azure DevOps bug #${bugId}: ${bugTitle}.`,
    "",
    `The automated verification step "${failedStep}" has failed after your fix was applied.`,
    "Read `_verification-report.md` for the full failure output.",
    "",
    "The file `_bug-context.md` is still present with the original bug details. Read it to understand what was fixed so you don't undo that work.",
    "",
    "Your task:",
    "- Analyze the failure logs carefully.",
    "- Determine whether the failure is caused by the bug fix or was pre-existing.",
    "- Fix the code so that the verification step passes.",
    "- You MAY edit test files, production code, and build configuration as needed.",
    "- Do NOT modify API specs, OpenAPI/Swagger definitions, protobuf files, or design documents.",
    "- Do NOT undo or weaken the original bug fix.",
    "- Make the smallest change that resolves the verification failure.",
    "",
    "Operating constraints:",
    "- Stay on the current branch. Do not create or switch branches.",
    "- Do not commit, push, or create a pull request.",
    "- Preserve existing code style.",
    "",
    "Final response format:",
    "Failure cause: ...",
    "Changes: ...",
    "Files modified: ...",
  ].join("\n");
}

const TEMP_FILES = ["_bug-context.md", "_verification-report.md"];

export function cleanupTempFiles(workDir: string) {
  for (const name of TEMP_FILES) {
    cleanup(path.join(workDir, name));
  }
}

function cleanup(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

function runCursorCli(workDir: string, prompt: string): Promise<CursorCliResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--workspace", workDir,
      prompt,
    ];

    const child = spawn("agent", args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Cursor agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`));
    }, AGENT_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Cursor agent: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Cursor agent exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        resolve({
          type: "result",
          subtype: code === 0 ? "success" : "error",
          is_error: code !== 0,
          duration_ms: 0,
          result: stdout.trim() || stderr.trim(),
          session_id: "",
        });
      }
    });
  });
}
