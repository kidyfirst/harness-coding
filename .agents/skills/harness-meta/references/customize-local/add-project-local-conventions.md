# Add Project-Local Conventions

Often the user does not need to change `harness-spec` mechanics; they need local AI to understand their team's conventions. In that case, prefer `spec/` or a project-local skill instead of editing `harness-meta`.

## Where To Put Things

| Content type | Location |
| --- | --- |
| Rules code must follow | `spec/<layer>/` |
| Cross-layer thinking methods | `spec/guides/` |
| AI capability for a project-specific flow | Platform-local skill |
| One-off task material | `tasks/<task>/` |
| Session summary | `workspace/<project-owner>/journal-N.md` |

## Create A Project-Local Skill

If the user wants AI to know "how this project customizes harness-spec," create a local skill:

```text
.claude/skills/harness-local/
└── SKILL.md
```

Example:

```md
---
name: harness-local
description: "Project-local harness-spec customizations for this repository. Use when changing this project's workflow, hooks, local agents, or team-specific conventions."
---

# Harness Local

## Local Scope

This skill documents this repository's local customizations only.

## Custom Workflow Rules

- ...

## Local Hook Changes

- ...

## Local Agent Changes

- ...
```

For multi-platform projects, place equivalent versions in other supported platform skill directories, or use `.agents/skills/` for platforms that support the shared layer.

## Write To `spec/`

If the content is a coding convention, write it to spec. Examples:

```text
.harness/spec/backend/error-handling.md
.harness/spec/frontend/components.md
.harness/spec/guides/cross-platform-thinking-guide.md
```

After writing it, update the corresponding `index.md` so AI can find the new rule from the entry point.

## Make The Current Task Use New Conventions

After writing a spec, add it to the current task context:

```bash
node ./.harness/scripts/task.js add-context <task> implement ".harness/spec/backend/error-handling.md" "Error handling conventions"
node ./.harness/scripts/task.js add-context <task> check ".harness/spec/backend/error-handling.md" "Review error handling"
```

## Do Not Store Project-Private Rules In `harness-meta`

`harness-meta` is a public skill for understanding the generated architecture and local customization entry points. Put project-private content in:

- `spec/`
- a project-local skill
- the current task
- workspace journal

This prevents future updates to built-in `harness-meta` files from overwriting the team's own conventions.
