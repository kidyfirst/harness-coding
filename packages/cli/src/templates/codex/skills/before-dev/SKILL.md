---
name: before-dev
description: "Discovers and injects project-specific coding guidelines from the personalized workflow spec tree before implementation begins. Reads spec indexes, pre-development checklists, and shared thinking guides for the target package."
---

Read the relevant development guidelines before starting your task.

1. Discover packages and spec layers:
   ```bash
   node ./.${your-name}/scripts/get_context.js --mode packages
   ```
2. Identify which specs apply based on package and work type.
3. Read the spec index for each relevant module:
   ```bash
   cat .${your-name}/spec/<package>/<layer>/index.md
   ```
4. Read the specific guideline files listed in the Pre-Development Checklist.
5. Always read shared guides:
   ```bash
   cat .${your-name}/spec/guides/index.md
   ```
6. Understand the coding standards and patterns you need to follow before writing code.

This step is mandatory before implementation.
