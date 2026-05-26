# Change Local Context Loading

Context loading determines when AI reads workflow, task, spec, research, workspace, and git status. Read this page when the user says "AI does not know the current task," "the agent did not read specs," or "there is too much or too little context."

## Read These Files First

1. `workflow.md`
2. `scripts/get_context.js`
3. `scripts/common/session_context.*`
4. `scripts/common/task_context.*`
5. `scripts/common/active_task.*`
6. Current platform hooks or agent files
7. The current task's `implement.jsonl` / `check.jsonl`

All paths above are relative to the personalized workflow root, for example `.${your-name}/`.

## Context Sources

| Source | Purpose |
| --- | --- |
| `workflow.md` | Workflow and next-action hints. |
| `tasks/<task>/prd.md` | Current task requirements. |
| `tasks/<task>/implement.jsonl` | Spec/research to read before implementation. |
| `tasks/<task>/check.jsonl` | Spec/research to read during checking. |
| `spec/` | Project specs. |
| `workspace/` | Session records. |
| git status | Current working tree changes. |

## Common Needs And Edit Points

| Need | Edit point |
| --- | --- |
| Inject more or less information in new sessions | `session_context` or the platform `session-start` hook. |
| Change hints on each user input | `[workflow-state:STATUS]` block in `workflow.md`. The `inject-workflow-state` hook is parser-only and reads the block verbatim. |
| Agent did not read specs | Task JSONL, agent prelude, `inject-subagent-context` hook. |
| Active task is lost | `active_task` and platform session identity propagation. |
| Change JSONL validation rules | `task_context`. |

## JSONL Rules

`implement.jsonl` / `check.jsonl` are the key context loading interface:

```jsonl
{"file": ".${your-name}/spec/backend/index.md", "reason": "Backend conventions"}
{"file": ".${your-name}/tasks/04-28-x/research/api.md", "reason": "API research"}
```

Include only spec/research files. Do not put code files that will be modified into these manifests; agents read code files themselves during implementation.

## Change Session Context

If the user wants every new session to see more project state, edit:

- `scripts/common/session_context.*`
- the corresponding platform `session-start` hook

Context cannot grow without bound. Prefer injecting indexes and paths so the AI can read detailed files on demand.

## Change Sub-Agent Context

First determine which mode the platform uses:

- hook push: edit the `inject-subagent-context` hook.
- agent pull: edit the read steps in the corresponding implementation/check agent file.

In both modes, make sure the agent ultimately reads:

1. active task
2. `prd.md`
3. `info.md` if present
4. the corresponding JSONL
5. spec/research referenced by the JSONL

## Troubleshooting Order

```bash
node ./.${your-name}/scripts/task.js current --source
node ./.${your-name}/scripts/task.js list-context <task>
node ./.${your-name}/scripts/task.js validate <task>
node ./.${your-name}/scripts/get_context.js --mode packages
```

Confirm the task and JSONL are correct before editing hooks or agents.
