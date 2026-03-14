import type { SayFn } from "@slack/bolt";

export async function sendPickedUp(say: SayFn, ticketId: string) {
  await say({
    text: `:hourglass_flowing_sand: Picking up ticket *#${ticketId}*... Fetching details from Azure DevOps.`,
  });
}

export async function sendQueued(say: SayFn, ticketId: string, position?: number) {
  const suffix = position ? ` at position *#${position}*` : "";
  await say({
    text: `:hourglass: Bug *#${ticketId}* has been queued${suffix}.`,
  });
}

export async function sendAlreadyQueued(say: SayFn, ticketId: string, position?: number) {
  const suffix = position ? ` at position *#${position}*` : "";
  await say({
    text: `:information_source: Bug *#${ticketId}* is already queued${suffix}.`,
  });
}

export async function sendAlreadyProcessing(say: SayFn, ticketId: string) {
  await say({
    text: `:warning: Bug *#${ticketId}* is already being processed.`,
  });
}

export async function sendProgress(say: SayFn, ticketId: string, message: string) {
  await say({
    text: `:gear: *#${ticketId}*: ${message}`,
  });
}

export async function sendPrCreated(
  say: SayFn,
  ticketId: string,
  prUrl: string,
  summary: string,
  filesChanged: string[]
) {
  const fileList = filesChanged.map((f) => `\`${f}\``).join(", ");
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *Bug #${ticketId} fixed!*\n\n*PR:* <${prUrl}|View Pull Request>\n\n*Summary:* ${summary}\n\n*Files changed:* ${fileList}`,
        },
      },
    ],
    text: `Bug #${ticketId} fixed! PR: ${prUrl}`,
  });
}

export async function sendError(say: SayFn, ticketId: string, error: string) {
  await say({
    text: `:x: Could not fix *#${ticketId}* — needs human attention.\n\`\`\`${error}\`\`\``,
  });
}
