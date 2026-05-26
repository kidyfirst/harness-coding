# Continue Current Task

Resume work on the current task and pick up at the right phase or step in `.${your-name}/workflow.md`.

---

## Step 1: Load Current Context

```bash
node ./.${your-name}/scripts/get_context.js
```

Confirms the current task, git state, and recent commits.

## Step 2: Load The Phase Index

```bash
node ./.${your-name}/scripts/get_context.js --mode phase
```

Shows the Phase Index with routing and skill mapping.

## Step 3: Decide Where You Are

`get_context.js` shows the active task's `status` field. Route by `status` plus artifact presence:

- `status=planning` + no `prd.md`: `1.1` and load `brainstorm`
- `status=planning` + `prd.md` exists + `implement.jsonl` not curated: `1.3`
- `status=planning` + `prd.md` + curated `implement.jsonl`: `1.4` and run `task.js start`
- `status=in_progress` + implementation not started: `2.1`
- `status=in_progress` + implementation done, not yet checked: `2.2`
- `status=in_progress` + check passed: `3.1`
- `status=completed`: archive flow

Phase rules:

1. Run steps in order within a phase.
2. `[once]` steps are already done if their required artifact exists.
3. Go back to an earlier phase if new discoveries require it.

## Step 4: Load The Specific Step

Once you know which step to resume at:

```bash
node ./.${your-name}/scripts/get_context.js --mode phase --step <X.X> --platform {{CLI_FLAG}}
```

Follow the loaded instructions and move to the next required step when it completes.

---

## Reference

The canonical workflow, routing table, and do-not-skip rules live in `.${your-name}/workflow.md`. This command is only an entry point.
