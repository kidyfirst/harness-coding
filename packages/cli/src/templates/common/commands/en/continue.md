# Continue Current Task

Resume work on the current task and pick up at the right phase or step in `.${your-name}/workflow.md`.

---

## Step 1: Load Current Context

```bash
node ./.${your-name}/scripts/get_context.js
```

Confirms the current task, git state, and recent commits.

## Step 2: Load the Phase Index

```bash
node ./.${your-name}/scripts/get_context.js --mode phase
```

Shows the Phase Index (Plan / Execute / Finish) with routing and skill mapping.

## Step 3: Decide Where You Are

Use the active task `status` plus artifact presence:

- `status=planning` + no `prd.md` -> **1.1** (`harness-brainstorm`)
- `status=planning` + `prd.md` exists + `implement.jsonl` not curated -> **1.3**
- `status=planning` + `prd.md` + curated `implement.jsonl` -> **1.4**
- `status=in_progress` + implementation not started -> **2.1**
- `status=in_progress` + implementation done, not yet checked -> **2.2**
- `status=in_progress` + check passed -> **3.1**
- `status=completed` -> archive flow

## Step 4: Load the Specific Step

```bash
node ./.${your-name}/scripts/get_context.js --mode phase --step <X.X> --platform {{CLI_FLAG}}
```

Follow the loaded instructions, then move to the next required step.

---

## Reference

The full workflow and routing rules live in `.${your-name}/workflow.md`. This command is only the entry point.
