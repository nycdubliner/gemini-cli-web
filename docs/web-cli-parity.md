# Gemini CLI Web Parity Backlog

This tracks remaining gaps between the terminal Gemini CLI and the experimental
web CLI.

## Current Web Coverage

- Chat streaming through a shared `GeminiCliSession`.
- Safe/auto-approve policy toggle through `Ctrl+Y` and `/yolo`.
- Tool confirmation requests and tool lifecycle updates.
- Run cancellation.
- Session transcript replay.
- File reference search and safe preview with `@path`.
- Basic slash commands: `/help`, `/commands`, `/about`, `/clear`, `/yolo`,
  `/model`, and `/model set <model-name> [--persist]`.
- Slash command metadata supports nested subcommands so the web client can
  present command trees rather than only flat commands.

## Highest Value Gaps

1. Reuse the real command registry.
   The terminal loads built-ins, skills, MCP prompts, and file commands through
   `CommandService` with `BuiltinCommandLoader`, `SkillCommandLoader`,
   `McpPromptLoader`, and `FileCommandLoader`. The web CLI currently has a
   separate small command table. The web protocol can now represent nested
   command trees, but the next step is exposing the real registry from the web
   server and adapting command action outputs into web transcript/UI events.

2. Add web equivalents for command result types.
   Terminal commands can return messages, dialogs, submitted prompts, tool
   actions, and other UI-directed effects. Web currently handles only simple
   system messages and a `clear` action. A command bridge should support at
   least message, dialog, prompt submission, clipboard/copy fallbacks, and
   navigation/open-link results.

3. Build the model management dialog.
   Terminal `/model` opens a model dialog and `/model set <model-name>
   [--persist]` changes the model. Web now supports the set path and displays
   current model/quota, but bare `/model` is still an informational fallback
   rather than a picker.

4. Implement stats and tool inventory.
   Terminal `/stats` exposes session/model/tool usage and `/tools` lists tool
   names and descriptions. The web UI already receives tool lifecycle updates,
   so adding persistent tool usage and `/tools` output is a good next slice.

5. Implement memory and context commands.
   Terminal `/memory show|add|reload|list|inbox`, `/init`, `/compress`,
   `/directory`, and `/restore` change the operating context. These are central
   for long-running remote use and should be implemented before lower-value UI
   preferences.

6. Implement chat/session management parity.
   Terminal `/chat list|save|resume|delete|share`, `/resume`, `/rewind`, and
   checkpoint flows are richer than the current web transcript replay. Web needs
   named saved chats, resume/delete/share operations, and a rewind/checkpoint UI.

7. Implement MCP, agents, skills, extensions, hooks, and policies management.
   Terminal commands include `/mcp`, `/agents`, `/skills`, `/extensions`,
   `/hooks`, and `/policies`. Web currently shows counts only. Remote operation
   needs list/detail/enable/disable/reload views with the same admin-policy
   restrictions as the terminal.

8. Add auth/settings/privacy/update surfaces.
   Terminal includes `/auth`, `/settings`, `/privacy`, `/theme`, `/editor`,
   `/vim`, `/footer`, `/ide`, `/terminal-setup`, `/setup-github`, `/bug`,
   `/docs`, `/upgrade`, and `/quit`. Some are terminal-only or should become
   links/settings panels in web, but they should be explicitly mapped rather
   than ignored.

9. Match input ergonomics.
   Terminal supports hierarchical slash completion, shell-mode affordances,
   prompt history, keyboard shortcuts, dialogs, rich history item display, and
   clipboard-oriented commands. Web has first-pass slash and file completion but
   not the full interaction model.

10. Harden multi-client behavior.
    The web server tracks connected clients, but shared sessions need clear
    behavior for concurrent prompts, cancellation ownership, confirmation
    ownership, transcript sync, and mode changes from multiple devices.

## Built-In Terminal Commands Not Yet Implemented In Web

- `/agents`
- `/auth`
- `/bug`
- `/chat`
- `/compress`
- `/copy`
- `/corgi`
- `/directory`
- `/docs`
- `/editor`
- `/extensions`
- `/footer`
- `/hooks`
- `/ide`
- `/init`
- `/mcp`
- `/memory`
- `/permissions`
- `/plan`
- `/policies`
- `/privacy`
- `/profile`
- `/quit`
- `/restore`
- `/resume`
- `/rewind`
- `/settings`
- `/setup-github`
- `/shortcuts`
- `/skills`
- `/stats`
- `/tasks`
- `/terminal-setup`
- `/theme`
- `/tools`
- `/upgrade`
- `/vim`

Some commands are conditional in the terminal, depending on config, nightly,
development mode, auth type, or admin policy. The web command registry should
preserve those conditions instead of exposing unavailable operations.
