# Hooks And Settings

Hooks and settings are the entry layer that connects a platform to the generated workflow. They decide which scripts or adapters a platform runs for which events.

## Settings Responsibilities

Settings/config files usually register:

- session-start hook: injects a workflow overview when a new session starts or context resets
- workflow-state hook: parses `[workflow-state:STATUS]` blocks from `workflow.md` and emits the body matching the current task `status` on each user input
- sub-agent context hook: injects task context when implementation/check/research agents start
- shell/session bridge: lets shell commands see the same workflow session identity
- platform plugin or extension entry points

Common files:

| Platform | settings/config |
| --- | --- |
| Claude Code | `.claude/settings.json` |
| Codex | `.codex/hooks.json`, `.codex/config.toml` |
| Gemini CLI | `.gemini/settings.json` |

Whether these files exist in a project depends on which `harness-spec init` platform flags the user ran.

## Hook Script Types

| Script | Purpose |
| --- | --- |
| `session-start.js` | Generates session-start context. |
| `inject-workflow-state.js` | Parses `[workflow-state:STATUS]` blocks in `workflow.md` and emits the body matching the current task status. Falls back to `Refer to workflow.md for current step.` when no matching block exists. |
| `inject-subagent-context.js` | Injects PRD, JSONL context, and related spec/research into sub-agents. |
| `inject-shell-session-context.js` | Lets shell commands inherit workflow session identity. |

Not every platform has every hook. Do not copy files from another platform just because a platform lacks a hook; first confirm whether that platform supports the corresponding event.

## Local Change Scenarios

| User need | Edit location |
| --- | --- |
| AI should see more or less context in a new session | Platform `session-start` hook. |
| Per-turn hint policy should change | `[workflow-state:STATUS]` block in `workflow.md`. |
| Sub-agent cannot read PRD/spec | `inject-subagent-context` hook or agent prelude. |
| `task.js current` in shell has no active task | Shell/session bridge hook or platform environment variable configuration. |
| Disable an automatic injection | The corresponding hook registration in settings/config. |

## Modification Principles

1. Settings wire things up; hooks define behavior.
2. Confirm platform event names first.
3. Hooks read the local workflow root, not upstream source.
4. Errors must be visible.

## Troubleshooting Path

If the user says "AI did not read workflow state":

1. Check whether the platform settings register the hook.
2. Check whether the hook file exists.
3. Manually run the `scripts/get_context.js` or `task.js current --source` command that the hook depends on.
4. Check whether active task state exists in `.runtime/sessions/`.
5. Check whether the platform shell passes session identity.
