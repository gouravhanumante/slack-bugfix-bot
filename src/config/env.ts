import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  slack: {
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    signingSecret: required("SLACK_SIGNING_SECRET"),
  },
  ado: {
    orgUrl: required("ADO_ORG_URL"),
    pat: required("ADO_PAT"),
    project: required("ADO_PROJECT"),
  },
  github: {
    token: required("GITHUB_TOKEN"),
    repoOwner: required("GITHUB_REPO_OWNER"),
    repoName: required("GITHUB_REPO_NAME"),
    repoUrl: required("GITHUB_REPO_URL"),
  },
  legacy: {
    androidPath: process.env.LEGACY_ANDROID_PATH || "",
    iosPath: process.env.LEGACY_IOS_PATH || "",
  },
  bot: {
    repoBaseBranch: process.env.REPO_BASE_BRANCH || "main",
    maxAgentIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || "25", 10),
    maxConcurrentTickets: Math.max(1, parseInt(process.env.MAX_CONCURRENT_TICKETS || "1", 10) || 1),
  },
};
