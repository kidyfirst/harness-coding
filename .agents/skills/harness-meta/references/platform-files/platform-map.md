# Platform File Map

This page lists common file locations in a user project by supported platform. Whether a platform directory exists in an actual project depends on which `harness-spec init` flags the user ran.

## Matrix

| Platform | CLI flag | Main directory | Skill directory | Agent directory | Hooks/extensions |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `--claude` | `.claude/` | `.claude/skills/` | `.claude/agents/` | `.claude/hooks/` + `.claude/settings.json` |
| Codex | `--codex` | `.codex/` | `.agents/skills/`, `.codex/skills/` | `.codex/agents/` | `.codex/hooks/` + `.codex/hooks.json` |
| Gemini CLI | `--gemini` | `.gemini/` | `.agents/skills/` | `.gemini/agents/` | `.gemini/hooks/` + `.gemini/settings.json` |

## Capability Groups

### Sub-Agent Support

These supported platforms usually have separate research, implement, and check agent files:

- Claude Code
- Codex
- Gemini CLI

When changing implementation/check/research behavior, look for the corresponding platform agent files first.

### Shared `.agents/skills/`

Codex and Gemini can share the `.agents/skills/` layer. If the user wants multiple compatible tools to share one skill, consider `.agents/skills/` first, but do not assume every platform reads it the same way.

## Decision Rules When Modifying Platform Files

1. User specified a platform: modify only that platform directory unless shared workflow/spec files must also change.
2. User says "all platforms should do this": synchronize equivalent entry points platform by platform; do not modify only one directory.
3. User only says "my AI": inspect the configuration directories that actually exist in the project and infer the current platform.
4. User wants project rules: prefer `spec/` or a project-local skill.
5. User wants workflow behavior: edit `workflow.md` plus platform hooks/agents/skills/commands.

## When Paths Differ

Platform ecosystems change, and user projects may already be customized. If this table disagrees with local files, use the actual settings/config in the user project as authoritative:

- Check the hook that settings registers.
- Check the script that a command, prompt, or workflow points to.
- Judge behavior by the read rules currently written in the agent file.

Do not delete a custom file just because it is not listed in this path table.
