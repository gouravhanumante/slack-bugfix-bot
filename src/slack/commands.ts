import type { App, SayFn } from "@slack/bolt";
import { fetchBugDetails } from "../azure/workItems";
import { createPullRequest } from "../azure/pullRequests";
import { prepareWorkspace, commitAndPush, cleanupWorkspace, type GitWorkspace } from "../git/gitManager";
import { runAgent, cleanupTempFiles } from "../agent/agent";
import { runVerificationPipeline } from "../verify/repair";
import {
  sendPickedUp,
  sendQueued,
  sendAlreadyQueued,
  sendAlreadyProcessing,
  sendProgress,
  sendPrCreated,
  sendError,
} from "./messages";
import { ticketQueue } from "./queueManager";

function createChannelMessenger(client: App["client"], channel: string): SayFn {
  return (async (message) => {
    if (typeof message === "string") {
      return client.chat.postMessage({ channel, text: message });
    }

    return client.chat.postMessage({
      channel,
      ...message,
    });
  }) as SayFn;
}

export function registerCommands(app: App) {
  app.command("/fix-bug", async ({ command, ack, client }) => {
    await ack();
    const messenger = createChannelMessenger(client, command.channel_id);

    const ticketIdStr = command.text.trim();

    if (!ticketIdStr || !/^\d+$/.test(ticketIdStr)) {
      await messenger(`:warning: Usage: \`/fix-bug <ticket-number>\`\nExample: \`/fix-bug 12345\``);
      return;
    }

    const ticketId = parseInt(ticketIdStr, 10);
    const queueResult = ticketQueue.enqueue(ticketId, async () => {
      try {
        await sendPickedUp(messenger, String(ticketId));
      } catch (err) {
        console.warn(`Failed to send pickup message for bug #${ticketId}:`, err);
      }
      await processBug(ticketId, messenger);
    });

    switch (queueResult.status) {
      case "started":
        return;
      case "queued":
        await sendQueued(messenger, String(ticketId), queueResult.position);
        return;
      case "already_queued":
        await sendAlreadyQueued(messenger, String(ticketId), queueResult.position);
        return;
      case "already_processing":
        await sendAlreadyProcessing(messenger, String(ticketId));
        return;
      default:
        console.warn(`Unexpected queue status for bug #${ticketId}:`, queueResult);
        await messenger(`:warning: Could not queue bug *#${ticketId}*. Please try again.`);
        return;
    }
  });
}

async function processBug(ticketId: number, say: Parameters<typeof sendPickedUp>[0]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing bug #${ticketId}`);
  console.log(`${"=".repeat(60)}`);

  let workspace: GitWorkspace | null = null;

  try {
    await sendProgress(say, String(ticketId), "Fetching bug details from Azure DevOps...");
    const bug = await fetchBugDetails(ticketId);
    console.log(`Bug: ${bug.title}`);
    console.log(`Attachments: ${bug.attachments.length}`);

    await sendProgress(say, String(ticketId), "Preparing git workspace...");
    workspace = await prepareWorkspace(ticketId);
    console.log(`Workspace: ${workspace.workDir}`);
    console.log(`Branch: ${workspace.branch}`);

    await sendProgress(say, String(ticketId), "AI agent is analyzing the code...");
    const result = await runAgent(workspace.workDir, bug, async (msg) => {
      await sendProgress(say, String(ticketId), msg);
    });

    console.log(`Agent result: success=${result.success}, tools=${result.toolCallCount}`);
    console.log(`Summary: ${result.summary}`);

    if (!result.success) {
      await sendError(say, String(ticketId), result.summary);
      return;
    }

    await sendProgress(say, String(ticketId), "Running verification (tests + builds)...");
    const verification = await runVerificationPipeline(
      workspace.workDir,
      ticketId,
      bug.title,
      async (msg) => {
        await sendProgress(say, String(ticketId), msg);
      }
    );

    if (!verification.success) {
      await sendError(say, String(ticketId), `Verification failed — needs human attention.\n${verification.summary}`);
      return;
    }

    cleanupTempFiles(workspace.workDir);

    await sendProgress(say, String(ticketId), "All checks passed — committing and pushing...");
    let filesChanged: string[];
    try {
      filesChanged = await commitAndPush(workspace, ticketId, bug.title);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sendError(say, String(ticketId), `Failed to commit: ${message}`);
      return;
    }

    await sendProgress(say, String(ticketId), "Creating pull request...");
    const pr = await createPullRequest(
      workspace.branch,
      ticketId,
      bug.title,
      result.summary,
      filesChanged
    );

    await sendPrCreated(say, String(ticketId), pr.url, result.summary, filesChanged);
    console.log(`PR created: ${pr.url}`);
    console.log(`Done processing bug #${ticketId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing bug #${ticketId}:`, message);
    await sendError(say, String(ticketId), message);
  } finally {
    if (workspace) {
      await cleanupWorkspace(workspace);
    }
  }
}
