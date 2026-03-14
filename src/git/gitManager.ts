import simpleGit, { SimpleGit } from "simple-git";
import path from "path";
import fs from "fs";
import { config } from "../config/env";

const WORKSPACES_DIR = path.join(process.cwd(), "workspaces");
const MAIN_REPO_DIR = path.join(WORKSPACES_DIR, "_main-repo");
let mainRepoLock: Promise<void> = Promise.resolve();

export interface GitWorkspace {
  workDir: string;
  branch: string;
  runId: string;
  git: SimpleGit;
}

function ensureWorkspacesDir() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
}

function createRunId(ticketId: number): string {
  const timestamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${ticketId}-${timestamp}-${suffix}`;
}

async function withMainRepoLock<T>(work: () => Promise<T>): Promise<T> {
  const previousLock = mainRepoLock;
  let release: (() => void) | undefined;
  mainRepoLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previousLock;

  try {
    return await work();
  } finally {
    release?.();
  }
}

export async function prepareWorkspace(ticketId: number): Promise<GitWorkspace> {
  ensureWorkspacesDir();

  const runId = createRunId(ticketId);
  const workDir = path.join(WORKSPACES_DIR, `bug-${runId}`);
  const branch = `bugfix/${runId}`;

  return withMainRepoLock(async () => {
    if (!fs.existsSync(MAIN_REPO_DIR)) {
      console.log(`Cloning repository to ${MAIN_REPO_DIR}...`);
      const git = simpleGit();
      await git.clone(config.github.repoUrl, MAIN_REPO_DIR);
    }

    const mainGit = simpleGit(MAIN_REPO_DIR);
    await mainGit.fetch("origin");
    await mainGit.checkout(config.bot.repoBaseBranch);
    await mainGit.pull("origin", config.bot.repoBaseBranch);

    console.log(`Creating worktree for ${runId}...`);
    await mainGit.raw(["worktree", "add", "-b", branch, workDir, config.bot.repoBaseBranch]);

    const git = simpleGit(workDir);

    return { workDir, branch, runId, git };
  });
}

export async function commitAndPush(
  workspace: GitWorkspace,
  ticketId: number,
  title: string
): Promise<string[]> {
  const { git, branch } = workspace;

  const status = await git.status();
  const filesChanged = [...status.modified, ...status.created, ...status.not_added];

  if (filesChanged.length === 0) {
    throw new Error("No files were changed by the AI agent");
  }

  await git.add(".");
  await git.commit(`fix: resolve bug #${ticketId} - ${title}`);
  await git.push("origin", branch, ["--set-upstream"]);

  return filesChanged;
}

export async function cleanupWorkspace(workspace: GitWorkspace) {
  await withMainRepoLock(async () => {
    if (!fs.existsSync(MAIN_REPO_DIR)) return;

    const mainGit = simpleGit(MAIN_REPO_DIR);

    try {
      await mainGit.raw(["worktree", "remove", workspace.workDir, "--force"]);
    } catch (err) {
      console.warn("Failed to cleanup worktree:", err);
    }

    try {
      await mainGit.raw(["branch", "-D", workspace.branch]);
    } catch (err) {
      console.warn("Failed to cleanup branch:", err);
    }
  });

  if (fs.existsSync(workspace.workDir)) {
    fs.rmSync(workspace.workDir, { recursive: true, force: true });
  }
}
