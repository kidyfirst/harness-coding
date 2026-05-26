# Workspace Index

> Records of all AI agent work across every project owner using this workflow.

---

## Overview

This directory tracks project-owner session records for AI-assisted work in this project.

### File Structure

```text
workspace/
|-- index.md              # This file - main index
+-- {project-owner}/      # Project-owner directory
    |-- index.md          # Project-owner index with session history
    |-- tasks/            # Task files
    |   |-- *.json        # Active tasks
    |   +-- archive/      # Archived tasks by month
    +-- journal-N.md      # Journal files (sequential: 1, 2, 3...)
```

---

## Active Project Owners

| Project Owner | Last Active | Sessions | Active File |
|-----------|-------------|----------|-------------|
| (none yet) | - | - | - |

---

## Getting Started

### For New Project Owners

Run the initialization script:

```bash
node ./.${your-name}/scripts/init_project_owner.js <your-name>
```

This will:
1. Create your project owner record (gitignored)
2. Create your progress directory
3. Create your project-owner index
4. Create the initial journal file

### For Returning Project Owners

1. Get the current project owner name:
   ```bash
   node ./.${your-name}/scripts/get_project_owner.js
   ```

2. Read your project-owner index:
   ```bash
   cat .${your-name}/workspace/$(node ./.${your-name}/scripts/get_project_owner.js)/index.md
   ```

---

## Guidelines

### Journal File Rules

- **Max 2000 lines** per journal file
- When the limit is reached, create `journal-{N+1}.md`
- Update your personal `index.md` when creating new files

### Session Record Format

Each session should include:
- Summary: one-line description
- Branch: which branch the work was done on
- Main Changes: what was modified
- Git Commits: commit hashes and messages
- Next Steps: what to do next

---

## Session Template

Use this template when recording sessions:

```markdown
## Session {N}: {Title}

**Date**: YYYY-MM-DD
**Task**: {task-name}
**Branch**: `{branch-name}`

### Summary

{One-line summary}

### Main Changes

- {Change 1}
- {Change 2}

### Git Commits

| Hash | Message |
|------|---------|
| `abc1234` | {commit message} |

### Testing

- [OK] {Test result}

### Status

[OK] **Completed** / [~] **In Progress** / [P] **Blocked**

### Next Steps

- {Next step 1}
- {Next step 2}
```

---

**Language**: All documentation should be written in **English**.
