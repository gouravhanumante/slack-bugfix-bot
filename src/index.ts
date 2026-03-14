import { App } from "@slack/bolt";
import { config } from "./config/env";
import { registerCommands } from "./slack/commands";

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
});

registerCommands(app);

(async () => {
  await app.start();
  console.log("-------------------------------------------");
  console.log("  Slack Bug-Fix Bot is running!");
  console.log("  Mode: Socket Mode (no public URL needed)");
  console.log("  AI: Cursor Agent CLI");
  console.log("  Listening for /fix-bug commands...");
  console.log("-------------------------------------------");
})();
