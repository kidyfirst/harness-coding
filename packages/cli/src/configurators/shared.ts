/**
 * Shared utilities for platform configurators.
 *
 * Extracted here to avoid circular dependencies (index.ts imports configurators,
 * configurators cannot import from index.ts).
 */

import type { TemplateContext } from "../types/ai-tools.js";
import { DIR_NAMES } from "../constants/paths.js";
import type { TemplateLanguage } from "../commands/init.js";

let resolvedRuntimeCommand = "node";
let resolvedWorkflowRoot: string = DIR_NAMES.WORKFLOW;

function replaceAll(
  content: string,
  searchValue: string,
  replaceValue: string,
): string {
  return content.split(searchValue).join(replaceValue);
}

function applyRuntimeCommand(content: string): string {
  return content
    .split("\n")
    .map((line) =>
      line.startsWith("#!")
        ? line.replace("python3", "node").replace("python", "node")
        : line.replaceAll("python3", resolvedRuntimeCommand).replaceAll(
            "python",
            resolvedRuntimeCommand,
          ),
    )
    .join("\n");
}

function applyRuntimeFileRenames(content: string): string {
  let result = content;
  result = replaceAll(result, ["task", ".py"].join(""), "task.js");
  result = replaceAll(result, ["get_context", ".py"].join(""), "get_context.js");
  result = replaceAll(result, ["init_project_owner", ".py"].join(""), "init_project_owner.js");
  result = replaceAll(result, ["add_session", ".py"].join(""), "add_session.js");
  result = replaceAll(result, ["get_project_owner", ".py"].join(""), "get_project_owner.js");
  result = replaceAll(
    result,
    ["inject-workflow-state", ".py"].join(""),
    "inject-workflow-state.js",
  );
  result = replaceAll(result, ["session-start", ".py"].join(""), "session-start.js");
  result = replaceAll(
    result,
    ["inject-subagent-context", ".py"].join(""),
    "inject-subagent-context.js",
  );
  result = replaceAll(
    result,
    ["inject-shell-session-context", ".py"].join(""),
    "inject-shell-session-context.js",
  );
  return result;
}

function applyHarnessBranding(content: string): string {
  let result = content;
  result = replaceAll(result, "WORKFLOW_ROOT/", `${resolvedWorkflowRoot}/`);
  result = replaceAll(result, "WORKFLOW_ROOT", resolvedWorkflowRoot);
  result = replaceAll(result, `.${"${your-name}"}/`, `${resolvedWorkflowRoot}/`);
  result = replaceAll(result, `.${"${your-name}"}`, resolvedWorkflowRoot);
  return result;
}

export function setResolvedRuntimeCommand(cmd: string): void {
  const trimmed = cmd.trim();
  resolvedRuntimeCommand = trimmed || "node";
}

export function setResolvedWorkflowRoot(workflowRoot: string): void {
  const trimmed = workflowRoot.trim();
  resolvedWorkflowRoot = trimmed || DIR_NAMES.WORKFLOW;
}

/** Test helper — clear the resolved cache between unit tests. */
export function resetResolvedRuntimeCommand(): void {
  resolvedRuntimeCommand = "node";
}

export function getRuntimeCommandForPlatform(
  platform?: NodeJS.Platform,
): string {
  void platform;
  return resolvedRuntimeCommand;
}

export function replaceCommandLiterals(content: string): string {
  return applyHarnessBranding(
    applyRuntimeFileRenames(applyRuntimeCommand(content)),
  );
}

/**
 * Resolve platform-specific placeholders in template content.
 *
 * When called without a context, only resolves {{RUNTIME_CMD}}
 * for settings.json, hooks.json, etc.).
 *
 * When called with a TemplateContext, additionally resolves:
 * - {{CMD_REF:name}}         → platform-specific command reference
 * - {{EXECUTOR_AI}}          → AI executor description
 * - {{USER_ACTION_LABEL}}    → user action label
 * - {{CLI_FLAG}}             → platform cli flag (e.g. "claude", "codex")
 * - {{#FLAG}}...{{/FLAG}}    → conditional include (when FLAG is true)
 * - {{^FLAG}}...{{/FLAG}}    → negated conditional (when FLAG is false)
 *
 * Supported conditional flags: AGENT_CAPABLE, HAS_HOOKS
 */
// Pre-compiled regexes for placeholder resolution
const RE_RUNTIME_CMD = /\{\{RUNTIME_CMD\}\}/g;
const RE_CMD_REF = /\{\{CMD_REF:([\w][\w-]*)\}\}/g;
const RE_EXECUTOR_AI = /\{\{EXECUTOR_AI\}\}/g;
const RE_USER_ACTION_LABEL = /\{\{USER_ACTION_LABEL\}\}/g;
const RE_CLI_FLAG = /\{\{CLI_FLAG\}\}/g;
const RE_BLANK_LINES = /\n{3,}/g;

const CONDITIONAL_FLAGS = ["AGENT_CAPABLE", "HAS_HOOKS"] as const;
const CONDITIONAL_REGEXES = Object.fromEntries(
  CONDITIONAL_FLAGS.map((flag) => [
    flag,
    {
      pos: new RegExp(
        `\\{\\{#${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
      neg: new RegExp(
        `\\{\\{\\^${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`,
        "g",
      ),
    },
  ]),
) as Record<(typeof CONDITIONAL_FLAGS)[number], { pos: RegExp; neg: RegExp }>;

export function resolvePlaceholders(
  content: string,
  context?: TemplateContext,
): string {
  let result = replaceCommandLiterals(
    content.replace(RE_RUNTIME_CMD, getRuntimeCommandForPlatform()),
  );

  if (!context) return result;

  // Simple substitutions
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `${context.cmdRefPrefix}${name}`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    // Reset lastIndex for global regexes reused across calls
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  // Clean up blank lines left by removed conditional blocks
  result = result.replace(RE_BLANK_LINES, "\n\n");

  return applyHarnessBranding(result);
}

/**
 * Resolve placeholders for files written under `.agents/skills/` (the shared
 * Agent Skills directory consumed by multiple platforms via the upstream
 * `.agents/skills/` workspace alias — Codex, Gemini CLI 0.40+, etc.).
 *
 * Identical to {@link resolvePlaceholders} except that {@link CMD_REF} is
 * rendered in a platform-neutral form (`` `name` (Harness command) ``)
 * instead of substituting a platform-specific prefix. This is the only
 * placeholder that varies between platforms in the 5 shared workflow skills
 * (`brainstorm`, `before-dev`, `check`, `break-loop`, `update-spec`), so
 * neutralizing it makes the rendered SKILL.md files byte-identical regardless
 * of which Harness Spec configurator wrote them — eliminating the
 * "last-writer-wins" collision when both Codex and Gemini target
 * `.agents/skills/`.
 *
 * `{{CLI_FLAG}}`, `{{EXECUTOR_AI}}`, `{{USER_ACTION_LABEL}}`, conditionals,
 * and `{{RUNTIME_CMD}}` are still resolved from the platform context. The 5
 * shared skills do not use those placeholders, so they remain platform-
 * neutral. Codex-only skill files (e.g. `harness-continue/SKILL.md`,
 * `harness-finish-work/SKILL.md` written via `resolveAllAsSkillsNeutral`) DO
 * use `{{CLI_FLAG}}` / `{{RUNTIME_CMD}}` and resolve to Codex-correct values
 * — no other platform writes those files, so byte-identity is not required.
 */
export function resolvePlaceholdersNeutral(
  content: string,
  context?: TemplateContext,
): string {
  let result = replaceCommandLiterals(
    content.replace(RE_RUNTIME_CMD, getRuntimeCommandForPlatform()),
  );

  if (!context) return result;

  // Neutral form for the only collision-causing placeholder
  result = result.replace(
    RE_CMD_REF,
    (_match, name: string) => `\`${name}\` (Harness command)`,
  );
  result = result.replace(RE_EXECUTOR_AI, context.executorAI);
  result = result.replace(RE_USER_ACTION_LABEL, context.userActionLabel);
  result = result.replace(RE_CLI_FLAG, context.cliFlag);

  // Conditional blocks (resolved per platform — none of the 5 shared skills
  // use conditionals, but Codex-only command-as-skill files might in future).
  const flagValues: Record<(typeof CONDITIONAL_FLAGS)[number], boolean> = {
    AGENT_CAPABLE: context.agentCapable,
    HAS_HOOKS: context.hasHooks,
  };

  for (const flag of CONDITIONAL_FLAGS) {
    const value = flagValues[flag];
    const { pos, neg } = CONDITIONAL_REGEXES[flag];
    pos.lastIndex = 0;
    neg.lastIndex = 0;
    result = result.replace(pos, value ? "$1" : "");
    result = result.replace(neg, value ? "" : "$1");
  }

  result = result.replace(RE_BLANK_LINES, "\n\n");

  return applyHarnessBranding(result);
}

// ---------------------------------------------------------------------------
// Template wrapping utilities
// ---------------------------------------------------------------------------

/** Skill description registry — maps template name to auto-trigger description. */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  start:
    "Initializes an AI development session by reading workflow guides, project owner record, git status, active tasks, and project guidelines from the personalized workflow root. Classifies incoming tasks and routes to brainstorm, direct edit, or task workflow. Use when beginning a new coding session, resuming work, starting a new task, or re-establishing project context.",
  continue:
    "Resume work on the current task. Loads the workflow Phase Index, figures out which phase or step to pick up at, then pulls the step-level detail via the generated get_context.js runtime. Use when coming back to an in-progress task and you need to know what to do next.",
  "finish-work":
    "Wrap up the current session: verify quality gate passed, remind user to commit, archive completed tasks, and record session progress to the project-owner session journal. Use when done coding and ready to end the session.",
  "before-dev":
    "Discovers and injects project-specific coding guidelines from the personalized spec directory before implementation begins. Reads spec indexes, pre-development checklists, and shared thinking guides for the target package. Use when starting a new coding task, before writing any code, switching to a different package, or needing to refresh project conventions and standards.",
  brainstorm:
    "Guides collaborative requirements discovery before implementation. Creates task directory, seeds PRD, asks high-value questions one at a time, researches technical choices, and converges on MVP scope. Use when requirements are unclear, there are multiple valid approaches, or the user describes a new feature or complex task.",
  check:
    "Comprehensive quality verification: spec compliance, lint, type-check, tests, cross-layer data flow, code reuse, and consistency checks. Use when code is written and needs quality verification, before committing changes, or to catch context drift during long sessions.",
  "break-loop":
    "Deep bug analysis to break the fix-forget-repeat cycle. Analyzes root cause category, why fixes failed, prevention mechanisms, and captures knowledge into specs. Use after fixing a bug to prevent the same class of bugs.",
  "update-spec":
    "Captures executable contracts and coding conventions into the personalized spec documents. Use when learning something valuable from debugging, implementing, or discussion that should be preserved for future sessions.",
};

/**
 * Wrap resolved template content with YAML frontmatter for skill format.
 * Used by platforms that use SKILL.md.
 */
export function wrapWithSkillFrontmatter(
  name: string,
  content: string,
): string {
  // Look up description by base name (without legacy or harness prefix)
  const baseName = name.replace(/^(?:harness-spec|harness)-/, "");
  const description = SKILL_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing skill description for "${baseName}". Add it to SKILL_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: "${description}"\n---\n\n${content}`;
}

/**
 * One-line blurbs shown in a `/` command palette — kept separate from
 * SKILL_DESCRIPTIONS, which is long prose aimed at the skill matcher.
 */
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  start: "Initialize a Harness Spec development session.",
  continue: "Resume work on the current task at the correct phase.",
  "finish-work":
    "Wrap up the current session: quality gate, commit reminder, archive, journal.",
};

/** Wrap resolved command content with YAML frontmatter (name + description). */
export function wrapWithCommandFrontmatter(
  name: string,
  content: string,
): string {
  const baseName = name.replace(/^(?:harness-spec|harness)-/, "");
  const description = COMMAND_DESCRIPTIONS[baseName];
  if (!description) {
    throw new Error(
      `Missing command description for "${baseName}". Add it to COMMAND_DESCRIPTIONS in shared.ts.`,
    );
  }
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`;
}

// ---------------------------------------------------------------------------
// Shared configurator helpers
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  type CommonTemplate,
  getLocalizedBundledSkillTemplates,
  getLocalizedCommandTemplates,
  getLocalizedSkillTemplates,
} from "../templates/common/index.js";

/** A resolved template ready to be written to disk. */
export interface ResolvedTemplate {
  name: string;
  content: string;
}

/** A resolved file inside a multi-file skill directory. */
export interface ResolvedSkillFile {
  /** POSIX path relative to the skills root, e.g. "harness-meta/SKILL.md" */
  relativePath: string;
  content: string;
}

/**
 * Filter command templates based on platform capabilities.
 *
 * `start.md` is only emitted for platforms that need an explicit user-facing
 * bootstrap entrypoint. On agent-capable platforms, the session-start hook / plugin
 * already injects the workflow overview, so a user-facing `start` command
 * would be redundant.
 */
function filterCommands(
  templates: CommonTemplate[],
  ctx: TemplateContext,
): CommonTemplate[] {
  if (ctx.agentCapable) {
    return templates.filter((t) => t.name !== "start");
  }
  return templates;
}

/**
 * Resolve all templates as skills with the harness- prefix.
 * Used by skill-first platforms where everything is exposed as a skill.
 *
 * `start` is filtered out on agent-capable platforms — the session-start hook
 * injects the workflow overview instead.
 */
export function resolveAllAsSkills(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getLocalizedCommandTemplates(language), ctx),
    ...getLocalizedSkillTemplates(language),
  ];
  return templates.map((tmpl) => ({
    name: `harness-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `harness-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Resolve command templates as plain commands (no wrapping).
 * Used by "both" platforms for the user-ritual commands.
 *
 * `start` is filtered out on agent-capable platforms.
 */
export function resolveCommands(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate[] {
  return filterCommands(getLocalizedCommandTemplates(language), ctx).map((tmpl) => ({
    name: tmpl.name,
    content: resolvePlaceholders(tmpl.content, ctx),
  }));
}

/**
 * Resolve only the 5 skill templates with harness- prefix + SKILL.md frontmatter.
 * Used by "both" platforms for the auto-triggered skills.
 */
export function resolveSkills(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate[] {
  return getLocalizedSkillTemplates(language).map((tmpl) => ({
    name: `harness-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `harness-${tmpl.name}`,
      resolvePlaceholders(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveSkills} but uses {@link resolvePlaceholdersNeutral}
 * so the rendered SKILL.md files are byte-identical across any two platforms
 * that target `.agents/skills/`. Use this for shared `.agents/skills/`
 * writes (Gemini); platform-private skill roots should keep
 * {@link resolveSkills}.
 */
export function resolveSkillsNeutral(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate[] {
  return getLocalizedSkillTemplates(language).map((tmpl) => ({
    name: `harness-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `harness-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Same as {@link resolveAllAsSkills} but uses
 * {@link resolvePlaceholdersNeutral} for the 5 shared skills. The 2 command
 * templates (continue, finish-work) folded into the skill set still resolve
 * `{{CLI_FLAG}}` / `{{RUNTIME_CMD}}` per platform — only Codex writes those
 * files into `.agents/skills/`, so byte-identity isn't required there.
 */
export function resolveAllAsSkillsNeutral(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate[] {
  const templates = [
    ...filterCommands(getLocalizedCommandTemplates(language), ctx),
    ...getLocalizedSkillTemplates(language),
  ];
  return templates.map((tmpl) => ({
    name: `harness-${tmpl.name}`,
    content: wrapWithSkillFrontmatter(
      `harness-${tmpl.name}`,
      resolvePlaceholdersNeutral(tmpl.content, ctx),
    ),
  }));
}

/**
 * Codex needs a `harness-start` skill in `.agents/skills/` so the
 * bootstrap notice from `inject-workflow-state.py` resolves to an actual
 * skill file.
 *
 * Built from `common/commands/start.md` + skill frontmatter; renders
 * neutrally so init and update produce byte-identical output. Returns
 * `null` if the template is missing (defensive — should never happen).
 *
 * Used by both `configureCodex()` (init path, file write) and
 * `collectPlatformTemplates.codex` (update path, manifest map). Both
 * paths must agree, otherwise upgraded users miss the file (which broke
 * 0.4.x → 0.5.5/0.5.6 upgrades — see #247-style symptom: AI reports
 * "no .agents/skills/harness-start/SKILL.md" because update only ran
 * `collectTemplates` and never wrote the file).
 */
export function resolveCodexHarnessStartSkill(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedTemplate | null {
  const startTemplate = getLocalizedCommandTemplates(language).find(
    (t) => t.name === "start",
  );
  if (!startTemplate) return null;
  return {
    name: "harness-start",
    content: wrapWithSkillFrontmatter(
      "harness-start",
      resolvePlaceholdersNeutral(startTemplate.content, ctx),
    ),
  };
}

/**
 * Resolve multi-file built-in skills.
 *
 * Unlike workflow skills, bundled skills already contain their own SKILL.md
 * frontmatter and may include references/assets. They are still rendered
 * through placeholder resolution so init and update get byte-identical output.
 */
export function resolveBundledSkills(
  ctx: TemplateContext,
  language: TemplateLanguage = "en",
): ResolvedSkillFile[] {
  return getLocalizedBundledSkillTemplates(language).flatMap((skill) =>
    skill.files.map((file) => ({
      relativePath: `${skill.name}/${file.relativePath}`,
      content: resolvePlaceholders(file.content, ctx),
    })),
  );
}

// ---------------------------------------------------------------------------
// Shared configurator write helpers
// ---------------------------------------------------------------------------

/** Collect skill files under a target root for update hash tracking. */
export function collectSkillTemplates(
  skillsRoot: string,
  skills: readonly { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Map<string, string> {
  const files = new Map<string, string>();
  for (const skill of skills) {
    files.set(`${skillsRoot}/${skill.name}/SKILL.md`, skill.content);
  }
  for (const skillFile of bundledSkills) {
    files.set(`${skillsRoot}/${skillFile.relativePath}`, skillFile.content);
  }
  return files;
}

/** Write skill directories from resolved templates and bundled skill files. */
export async function writeSkills(
  skillsRoot: string,
  skills: { name: string; content: string }[],
  bundledSkills: readonly ResolvedSkillFile[] = [],
): Promise<void> {
  ensureDir(skillsRoot);
  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      replaceCommandLiterals(skill.content),
    );
  }
  for (const skillFile of bundledSkills) {
    const targetPath = path.join(skillsRoot, skillFile.relativePath);
    ensureDir(path.dirname(targetPath));
    await writeFile(
      targetPath,
      replaceCommandLiterals(skillFile.content),
    );
  }
}

/** Write agent/droid definition files */
export async function writeAgents(
  agentsDir: string,
  agents: { name: string; content: string }[],
  ext = ".md",
): Promise<void> {
  ensureDir(agentsDir);
  for (const agent of agents) {
    await writeFile(
      path.join(agentsDir, `${agent.name}${ext}`),
      replaceCommandLiterals(agent.content),
    );
  }
}

/** Write the shared hook scripts that `platform` actually registers. */
export async function writeSharedHooks(
  hooksDir: string,
  platform: import("../templates/shared-hooks/index.js").SharedHookPlatform,
): Promise<void> {
  const { getSharedHookScriptsForPlatform } =
    await import("../templates/shared-hooks/index.js");
  ensureDir(hooksDir);
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replaceCommandLiterals(hook.content),
    );
  }
}

export function removeDirIfEmpty(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  if (!fs.statSync(dirPath).isDirectory()) {
    return;
  }

  if (fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath);
  }
}

// ---------------------------------------------------------------------------
// Pull-based sub-agent prelude for platforms whose runtime cannot inject
// sub-agent prompts automatically.
//
// Only implement & check need task-level context (prd + jsonl specs).
// research is orthogonal: it searches the spec tree and doesn't depend on an
// active task. Hook-based platforms mirror this (their `get_research_context`
// injects a spec-tree overview, not prd/jsonl). We leave research untouched.
// ---------------------------------------------------------------------------

export type SubAgentType = "implement" | "check";

/** Build the standard "load Harness Spec context first" prelude block. */
export function buildPullBasedPrelude(
  agentType: SubAgentType,
  language: TemplateLanguage = "en",
): string {
  // JSONL filenames stay as implement.jsonl / check.jsonl — they are internal
  // context buckets keyed by role (not by platform-visible agent name).
  const jsonl = agentType === "check" ? "check.jsonl" : "implement.jsonl";

  const englishPrelude = `## Required: Load Harness Spec Context First

This platform does NOT auto-inject task context via hook. Before doing anything else, you MUST load context yourself.

### Step 1: Find the active task path

Try in order — stop at the first one that yields a task path:

1. **Look at the dispatch prompt** you received from the main agent. If its first line is \`Active task: <path>\` (e.g. \`Active task: WORKFLOW_ROOT/tasks/04-17-foo\`), use that path. The main agent is required to include this line on class-2 platforms.
2. **Run** \`node ./WORKFLOW_ROOT/scripts/task.js current --source\` and read the \`Current task:\` line.
3. **If both fail** (no \`Active task:\` line in the prompt and \`task.js current\` returns no task), ask the user which task to work on; do NOT guess.

### Step 2: Load task context from the resolved path

1. Read the task's \`prd.md\` (requirements) and \`info.md\` if it exists (technical design).
2. Read \`<task-path>/${jsonl}\` — JSONL list of dev spec files relevant to this agent.
3. For each entry in the JSONL, Read its \`file\` path — these are the dev specs you must follow.
   **Skip rows without a \`"file"\` field** (e.g. \`{"_example": "..."}\` seed rows left over from \`task.js create\` before the curator ran).

If \`${jsonl}\` has no curated entries (only a seed row, or the file is missing), fall back to: read \`prd.md\`, list available specs with \`node ./WORKFLOW_ROOT/scripts/get_context.js --mode packages\`, and pick the specs that match the task domain yourself. Do NOT block on the missing jsonl — proceed with prd-only context plus your spec judgment.

If the resolved task path has no \`prd.md\`, ask the user what to work on; do NOT proceed without context.

---

`;

  const chinesePrelude = `## 必须先加载 Harness Spec 上下文

这个平台不会通过 hook 自动注入任务上下文。在开始任何工作之前，你必须先自行加载上下文。

### 第一步：找到当前活跃任务路径

按下面顺序尝试，命中第一个可用路径后就停止：

1. **查看主代理分发给你的提示词**。如果第一行是 \`Active task: <path>\`（例如 \`Active task: WORKFLOW_ROOT/tasks/04-17-foo\`），就直接使用这个路径。主代理在这类平台上必须提供这一行。
2. **运行** \`node ./WORKFLOW_ROOT/scripts/task.js current --source\`，读取输出中的 \`Current task:\` 行。
3. **如果以上都失败**（提示词里没有 \`Active task:\`，且 \`task.js current\` 也没有返回任务），请向用户确认当前要处理哪个任务；不要猜。

### 第二步：从解析出的任务路径加载上下文

1. 读取任务里的 \`prd.md\`（需求说明），如果有 \`info.md\` 也一并读取（技术设计）。
2. 读取 \`<task-path>/${jsonl}\`，这是与当前代理相关的规范文件 JSONL 清单。
3. 对 JSONL 中的每一条记录，读取其 \`file\` 路径对应的文件，这些就是你必须遵守的开发规范。
   **跳过没有 \`"file"\` 字段的行**（例如 \`{"_example": "..."}\` 这类由 \`task.js create\` 预置但尚未整理的示例行）。

如果 \`${jsonl}\` 没有整理好的条目（只有示例行，或者文件不存在），则回退为：读取 \`prd.md\`，再运行 \`node ./WORKFLOW_ROOT/scripts/get_context.js --mode packages\` 列出可用规范，并自行选择与任务领域匹配的规范文件。不要因为缺少 jsonl 而阻塞，直接用 prd 加你的规范判断继续。

如果解析出的任务路径下没有 \`prd.md\`，请先询问用户要处理什么工作；不要在缺少上下文的情况下继续。

---

`;

  return replaceCommandLiterals(
    language === "cn" ? chinesePrelude : englishPrelude,
  );
}

/** Insert prelude into a markdown agent definition (after YAML frontmatter). */
export function injectPullBasedPreludeMarkdown(
  content: string,
  agentType: SubAgentType,
  language: TemplateLanguage = "en",
): string {
  const prelude = buildPullBasedPrelude(agentType, language);
  const sections = splitMarkdownFrontmatter(content);

  if (!sections) {
    return prelude + content;
  }

  const head = `---\n${sections.frontmatter}\n---`;
  const tailTrimmed = sections.body.replace(/^(\r?\n)+/, "");
  return `${head}\n\n${prelude}${tailTrimmed}`;
}

/** Insert prelude into a TOML agent (codex `developer_instructions`). */
export function injectPullBasedPreludeToml(
  content: string,
  agentType: SubAgentType,
  language: TemplateLanguage = "en",
): string {
  const prelude = buildPullBasedPrelude(agentType, language);
  // Match: developer_instructions = """  followed by newline
  const re = /(developer_instructions\s*=\s*""")(\r?\n)/;
  if (!re.test(content)) {
    return content;
  }
  return content.replace(re, `$1$2${prelude}`);
}

/** Best-effort detect agent type from filename ("harness-implement.md" → "implement").
 *  Returns null for research and unknown names — they skip the prelude.
 */
export function detectSubAgentType(name: string): SubAgentType | null {
  const base = name.replace(/\.(md|toml|prompt\.md)$/, "");
  if (base === "harness-implement" || base === "harness-check") {
    return base === "harness-implement" ? "implement" : "check";
  }
  return null;
}

/** Shared transform: given a list of agents, prepend pull-based prelude to
 *  implement/check definitions. Used by both configurator (init-time write)
 *  and collectPlatformTemplates (update-time hash comparison) so the two
 *  code paths always agree on what's on disk.
 */
export interface AgentContent {
  name: string;
  content: string;
}

interface MarkdownFrontmatterSections {
  body: string;
  frontmatter: string;
}

function splitMarkdownFrontmatter(
  content: string,
): MarkdownFrontmatterSections | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
  };
}

export function applyPullBasedPreludeMarkdown(
  agents: readonly AgentContent[],
  language: TemplateLanguage = "en",
): AgentContent[] {
  return agents.map((a) => {
    const t = detectSubAgentType(a.name);
    if (!t) return { ...a };
    return {
      ...a,
      content: injectPullBasedPreludeMarkdown(a.content, t, language),
    };
  });
}

function mapLegacyToolToCopilot(tool: string): string[] {
  switch (tool) {
    case "Read":
      return ["read"];
    case "Write":
    case "Edit":
      return ["edit"];
    case "Glob":
    case "Grep":
      return ["search"];
    case "Bash":
      return ["execute"];
    case "mcp__exa__web_search_exa":
    case "mcp__exa__get_code_context_exa":
      return ["web", "exa/*"];
    case "mcp__chrome-devtools__*":
      return ["chrome-devtools/*"];
    case "Skill":
      return [];
    default:
      return [];
  }
}

function normalizeCopilotMarkdownAgentFrontmatter(content: string): string {
  const sections = splitMarkdownFrontmatter(content);
  if (!sections) {
    return content;
  }

  const frontmatter = sections.frontmatter.split(/\r?\n/);
  const body = sections.body;
  const normalized: string[] = [];

  for (const line of frontmatter) {
    if (!line.startsWith("tools:")) {
      normalized.push(line);
      continue;
    }

    const legacyTools = line
      .slice("tools:".length)
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const tools = [...new Set(legacyTools.flatMap(mapLegacyToolToCopilot))];

    normalized.push("tools:");
    for (const tool of tools) {
      normalized.push(`  - ${tool}`);
    }
  }

  return `---\n${normalized.join("\n")}\n---\n${body}`;
}

export function normalizeCopilotMarkdownAgents(
  agents: readonly AgentContent[],
): AgentContent[] {
  return agents.map((agent) => ({
    ...agent,
    content: normalizeCopilotMarkdownAgentFrontmatter(agent.content),
  }));
}

export function applyPullBasedPreludeToml(
  agents: readonly AgentContent[],
  language: TemplateLanguage = "en",
): AgentContent[] {
  return agents.map((a) => {
    const t = detectSubAgentType(a.name);
    if (!t) return { ...a };
    return {
      ...a,
      content: injectPullBasedPreludeToml(a.content, t, language),
    };
  });
}
