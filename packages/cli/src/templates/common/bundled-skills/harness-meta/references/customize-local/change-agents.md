# Change Local Agents

When the user wants to change research, implement, or check behavior, edit platform agent files in the user project.

## Read These Files First

1. Target platform agent directory
2. `workflow.md` Phase 2 and research routing
3. Current task `prd.md`
4. Current task `implement.jsonl` / `check.jsonl`
5. Relevant hook or agent prelude

## Common Paths

| Platform | Path |
| --- | --- |
| Claude Code | `.claude/agents/` |
| Codex | `.codex/agents/` |
| Gemini CLI | `.gemini/agents/` |

Use the actual paths in the user project as authoritative.

## Common Needs

| Need | Which agent to edit |
| --- | --- |
| Research must write files, not only reply in chat | research agent |
| Certain local specs must be read before implementation | implement agent + `implement.jsonl` configuration rules |
| Specific commands must run during checking | check agent |
| Agent must not modify certain directories | The corresponding agent's write boundary instructions |
| Agent output format must be fixed | The corresponding agent's final/reporting instructions |

## Modification Principles

1. Preserve role boundaries: research investigates and persists; implement writes implementation; check reviews and fixes.
2. Do not hard-code project specs into agents: long-term specs belong in `spec/`; agents are responsible for reading them.
3. Make read order explicit: active task, PRD, info, JSONL, then spec/research.
4. Make write boundaries explicit: which directories may be written and which may not.
5. Synchronize across platforms: when the user configured multiple supported platforms, decide whether to change only the current platform or all supported agent files.

## Agent Pull Platforms

If an agent file contains a prelude for "read task/context after startup," do not remove those steps when editing. Otherwise the agent will work only from chat context and bypass the workflow's core mechanism.

## Hook Push Platforms

If context is injected by a hook, the agent file should still retain responsibility boundaries. Do not remove PRD/spec requirements from the agent just because a hook injects context.
