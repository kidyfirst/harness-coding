# Finish Work

Wrap up the current session: archive the active task and record the session journal. Code commits are not done here; those belong to workflow Phase 3.4 before you invoke this command.

## Step 1: Survey Current State

```bash
node ./.${your-name}/scripts/get_context.js --mode record
```

This prints active tasks, git status, and recent commits.

## Step 2: Sanity check dirty paths

Run:

```bash
git status --porcelain
```

Filter out paths under `.${your-name}/workspace/` and `.${your-name}/tasks/`.

- If any remaining dirty path belongs to the current task, stop and tell the user to return to workflow Phase 3.4 to commit it before running `{{CMD_REF:finish-work}}`.
- If remaining dirty paths are clearly unrelated parallel work, mention them once and continue.
- If unsure, ask once whether those paths belong to this task or another window.

## Step 3: Archive task(s)

```bash
node ./.${your-name}/scripts/task.js archive <task-name>
```

Archive the current active task, plus any extra completed tasks the user wants to clean up in the same round.

## Step 4: Record session journal

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

Use the work commit hashes from Phase 3.4, not the archive commit hashes from Step 3.
