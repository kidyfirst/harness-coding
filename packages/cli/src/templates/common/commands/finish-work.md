# Finish Work

Wrap up the current session: archive the active task and record the session journal. Code commits are not done here; those belong to workflow Phase 3.4 before you invoke this command.

## Step 1: Survey Current State

```bash
node ./.${your-name}/scripts/get_context.js --mode record
```

This prints active tasks, git status, and recent commits. If other completed tasks appear, ask the user once whether they should be archived in the same round.

## Step 2: Sanity Check Dirty Paths

Run:

```bash
git status --porcelain
```

Filter out paths under `.${your-name}/workspace/` and `.${your-name}/tasks/`; those are managed by `add_session.js` and `task.js archive` auto-commits.

Then route:

- Any remaining path looks like current-task work: stop and tell the user to return to workflow Phase 3.4 to commit it before running `{{CMD_REF:finish-work}}`.
- All remaining paths look unrelated: mention them once and continue.
- Unsure: ask the user once whether they belong to this task or another window.

## Step 3: Archive Task

```bash
node ./.${your-name}/scripts/task.js archive <task-name>
```

Archive the current active task and any extra tasks the user confirmed in Step 1.

## Step 4: Record Session Journal

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

Use the work-commit hashes from Phase 3.4 for `--commit`. Do not include archive commit hashes.
