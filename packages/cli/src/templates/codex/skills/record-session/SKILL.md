---
name: record-session
description: "Records completed work progress to the personalized workflow journal after testing and commit. Captures session summaries, commit hashes, and updates developer index files for future session context."
---

[!] Prerequisite: use this only after the code has been tested and committed.

Do not run `git commit` here. The workflow scripts handle their own metadata commits.

## Record Work Progress

### Step 1: Get context and check tasks

```bash
node ./.${your-name}/scripts/get_context.js --mode record
```

Archive tasks whose work is actually done, regardless of whether `task.json.status` still says `planning` or `in_progress`.

```bash
node ./.${your-name}/scripts/task.js archive <task-name>
```

### Step 2: Add session

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary of what was done"
```

The script appends to the journal, rotates files when needed, updates indexes, and auto-commits workflow metadata.
