# Start Session

Initialize a Harness Spec managed development session. This platform has no session-start hook, so manually load the equivalent context by following these steps.

---

## Step 1: Current state

Identity, git status, current task, active tasks, and journal location.

```bash
node ./.${your-name}/scripts/get_context.js
```

If this output includes a line beginning `harness-spec update available:`, copy the full line verbatim when summarizing session context.

## Step 2: Workflow overview

Phase Index, routing rules, and do-not-skip reminders.

```bash
node ./.${your-name}/scripts/get_context.js --mode phase
```

Full guide in `.${your-name}/workflow.md`.

## Step 3: Guideline indexes

Discover packages and spec layers, then read each relevant index file.

```bash
node ./.${your-name}/scripts/get_context.js --mode packages
cat .${your-name}/spec/guides/index.md
cat .${your-name}/spec/<package>/<layer>/index.md
```

## Step 4: Decide next action

From Step 1 you know the current task. Check the task directory:

- **Active task + `prd.md` exists** -> Phase 2 step 2.1. Load the step detail:
  ```bash
  node ./.${your-name}/scripts/get_context.js --mode phase --step 2.1 --platform {{CLI_FLAG}}
  ```
- **Active task + no `prd.md`** -> Phase 1.1. Load the `harness-brainstorm` skill.
- **No active task** -> when the user describes multi-step work, load `harness-brainstorm` to clarify requirements, then create a task via `task.js create`. For simple one-off questions or trivial edits, answer directly.

---

## Skill routing

| User intent | Skill |
|---|---|
| New feature or unclear requirements | `harness-brainstorm` |
| About to write code | `harness-before-dev` |
| Done coding or quality check | `harness-check` |
| Stuck or fixed same bug multiple times | `harness-break-loop` |
| Learned something worth capturing | `harness-update-spec` |

Full rules live in `.${your-name}/workflow.md`.
