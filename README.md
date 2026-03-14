# slack-bugfix-bot

A Slack bot that automates bug fixing. It pulls bug tickets from Azure DevOps, invokes [Cursor Agent CLI](https://docs.cursor.com/agent) to analyze and fix the code, runs verification (build + tests), and opens a GitHub pull request — all triggered by a single Slack command.

## How It Works

```
/fix-bug 12345
    │
    ▼
┌──────────────────────────────┐
│  Fetch bug details from      │
│  Azure DevOps (title, repro  │
│  steps, attachments)         │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Create isolated git         │
│  worktree on a new branch    │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Invoke Cursor Agent CLI     │
│  with bug context to         │
│  analyze & fix the code      │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Run verification pipeline   │
│  (build, tests). On failure, │
│  auto-repair up to 2×        │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Commit, push, and create    │
│  a GitHub pull request       │
└──────────────┬───────────────┘
               ▼
       Slack notification
       with PR link
```

## Prerequisites

- **Node.js** >= 18
- **Cursor Agent CLI** (`agent`) available on `$PATH`
- A **Slack app** with Socket Mode enabled and the `/fix-bug` slash command configured
- **Azure DevOps** personal access token with work-item read permissions
- **GitHub** personal access token with repo/PR permissions
- The target repository cloned locally (the bot creates worktrees from it)

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/gouravhanumante/slack-bugfix-bot.git
   cd slack-bugfix-bot
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `.env` with your tokens and paths. See [`.env.example`](.env.example) for all required variables.

3. **Build and run**

   ```bash
   # Production
   npm run build
   npm start

   # Development (watch mode)
   npm run dev
   ```

## Usage

In any Slack channel where the bot is installed:

```
/fix-bug 12345
```

The bot will post real-time progress updates to the channel and finish with a link to the pull request (or an error message if the fix fails).

Tickets are processed one at a time. Additional requests are queued automatically — the bot notifies you of queue position and rejects duplicates.

## Project Structure

```
src/
├── index.ts                 # App entry point (Slack Socket Mode)
├── config/
│   └── env.ts               # Environment variable loader
├── slack/
│   ├── commands.ts          # /fix-bug command handler & orchestration
│   ├── messages.ts          # Slack message formatting
│   └── queueManager.ts     # Sequential ticket processing queue
├── azure/
│   ├── workItems.ts         # Fetch bug details from Azure DevOps
│   └── pullRequests.ts      # Create PRs via GitHub API
├── git/
│   └── gitManager.ts        # Git worktree lifecycle (create, commit, push, cleanup)
├── agent/
│   └── agent.ts             # Cursor Agent CLI invocation & prompt construction
└── verify/
    ├── runner.ts            # Verification step runner (build, tests)
    └── repair.ts            # Auto-repair pipeline (re-invoke agent on failures)
```

## Configuration

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-...`) |
| `SLACK_SIGNING_SECRET` | Slack signing secret |
| `ANTHROPIC_API_KEY` | Anthropic API key (used by Cursor Agent) |
| `ADO_ORG_URL` | Azure DevOps organization URL |
| `ADO_PAT` | Azure DevOps personal access token |
| `ADO_PROJECT` | Azure DevOps project name |
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_REPO_OWNER` | GitHub repository owner |
| `GITHUB_REPO_NAME` | GitHub repository name |
| `GITHUB_REPO_URL` | Git clone URL for the target repository |
| `REPO_BASE_BRANCH` | Base branch for PRs (default: `main`) |
| `MAX_AGENT_ITERATIONS` | Max Cursor agent iterations per ticket |
| `MAX_CONCURRENT_TICKETS` | Max tickets processed in parallel (default: `1`) |

## License

MIT
