---
name: finish-work
description: "Wrap up an active harness-spec task: archive it and record a session journal. Refuses to run if the working tree has uncommitted code changes that belong to workflow Phase 3.4 first. Use when the user asks to finish, wrap up, or call it a day."
---

# Finish Work

Wrap up the current session: archive the active task and record the session journal. Code commits are not done here.

## Step 1: Survey current state

```bash
node ./.${your-name}/scripts/get_context.js --mode record
```

Review active tasks, git status, and recent commits.

## Step 2: Sanity check dirty paths

Run:

```bash
git status --porcelain
```

Ignore paths under `.${your-name}/workspace/` and `.${your-name}/tasks/`; those are managed by workflow scripts.

If current-task code is still uncommitted, stop and return to workflow Phase 3.4.

## Step 3: Archive task(s)

```bash
node ./.${your-name}/scripts/task.js archive <task-name>
```

Archive the current active task and any extra tasks the user explicitly confirms.

## Step 4: Record session journal

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

Use only the work-commit hashes from Phase 3.4.
