import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export interface VerifyStep {
  name: string;
  command: string;
  args: string[];
  timeoutMs: number;
}

export interface VerifyResult {
  step: string;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const MAX_LOG_LENGTH = 8000;

function tailLog(log: string): string {
  if (log.length <= MAX_LOG_LENGTH) return log;
  return `...(truncated)\n${log.slice(-MAX_LOG_LENGTH)}`;
}

export function getVerificationSteps(): VerifyStep[] {
  return [
    {
      name: "Unit Tests",
      command: "./gradlew",
      args: ["testDebugUnitTest", "--no-daemon"],
      timeoutMs: 600_000, // 10 min
    },
    {
      name: "Android Build",
      command: "./gradlew",
      args: [":androidApp:assembleDebug", "--no-daemon"],
      timeoutMs: 600_000,
    },
    {
      name: "iOS Shared Framework",
      command: "./gradlew",
      args: [":shared:linkDebugFrameworkIosSimulatorArm64", "--no-daemon"],
      timeoutMs: 600_000,
    },
    {
      name: "iOS App Build",
      command: "xcodebuild",
      args: [
        "-project", "iosApp/iosApp.xcodeproj",
        "-scheme", "iosApp",
        "-destination", "generic/platform=iOS Simulator",
        "-skipPackagePluginValidation",
        "-derivedDataPath", ".derivedData/iosApp",
        "build",
      ],
      timeoutMs: 900_000, // 15 min
    },
  ];
}

function ensureGradlewExecutable(workDir: string) {
  const gradlew = path.join(workDir, "gradlew");
  if (fs.existsSync(gradlew)) {
    try {
      execFileSync("chmod", ["+x", gradlew]);
    } catch { /* best-effort */ }
  }
}

export function runStep(workDir: string, step: VerifyStep): Promise<VerifyResult> {
  if (step.command === "./gradlew") {
    ensureGradlewExecutable(workDir);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const child = spawn(step.command, step.args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, step.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        step: step.name,
        passed: false,
        exitCode: null,
        stdout: tailLog(stdout),
        stderr: err.message,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        step: step.name,
        passed: code === 0,
        exitCode: code,
        stdout: tailLog(stdout),
        stderr: tailLog(stderr),
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

export function formatFailureReport(results: VerifyResult[]): string {
  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) return "";

  const sections = failures.map((f) => {
    const reason = f.timedOut
      ? `Timed out after ${Math.round(f.durationMs / 1000)}s`
      : `Exit code ${f.exitCode}`;

    const log = f.stderr.trim() || f.stdout.trim() || "(no output)";

    return [
      `## ${f.step} — FAILED`,
      `**Reason:** ${reason}`,
      "```",
      log,
      "```",
    ].join("\n");
  });

  return ["# Verification Failures", "", ...sections].join("\n\n");
}
