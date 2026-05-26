import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import figlet from "figlet";
import inquirer from "inquirer";
import { createWorkflowStructure } from "../configurators/workflow.js";
import {
  getInitToolChoices,
  resolveCliFlag,
  configurePlatform,
  getConfiguredPlatforms,
} from "../configurators/index.js";
import {
  setResolvedWorkflowRoot,
} from "../configurators/shared.js";
import { AI_TOOLS, type CliFlag } from "../types/ai-tools.js";
import {
  DIR_NAMES,
  FILE_NAMES,
  PATHS,
  getWorkflowDir,
  getPathsForWorkflowRoot,
} from "../constants/paths.js";
import { VERSION } from "../constants/version.js";
import { renderAgentsMdContent } from "../templates/markdown/index.js";
import {
  setWriteMode,
  startRecordingWrites,
  stopRecordingWrites,
  writeFile,
  type WriteMode,
} from "../utils/file-writer.js";
import { emptyTaskJson, type TaskJson } from "../utils/task-json.js";
import {
  detectProjectType,
  detectMonorepo,
  sanitizePkgName,
  type ProjectType,
  type DetectedPackage,
} from "../utils/project-detector.js";
import { initializeHashes } from "../utils/template-hash.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import { getConfiguredTemplateLanguage } from "../utils/workflow-root.js";
import {
  fetchTemplateIndex,
  probeRegistryIndex,
  downloadTemplateById,
  downloadRegistryDirect,
  parseRegistrySource,
  TIMEOUTS,
  TEMPLATE_INDEX_URL,
  type SpecTemplate,
  type TemplateStrategy,
  type RegistrySource,
  type RegistryBackend,
} from "../utils/template-fetcher.js";
import { setupProxy, maskProxyUrl } from "../utils/proxy.js";

function getOsDisplayName(
  platform: NodeJS.Platform = process.platform,
): string {
  switch (platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

function logRuntimeAdaptationNotice(command: string): void {
  const osName = getOsDisplayName();
  console.log(
    chalk.blue(
      `📌 ${osName} detected: Harness Spec rendered runtime commands as "${command}" in generated hooks, settings, and help text`,
    ),
  );
}

// =============================================================================
// Bootstrap Task Creation
// =============================================================================

const BOOTSTRAP_TASK_NAME = "00-bootstrap-guidelines";

/**
 * Slugify a project name for safe use in task directory names.
 *
 * Unlike `sanitizePkgName` (which only strips npm @scope/ prefixes), this
 * handles arbitrary project-personalization input: spaces, Unicode letters, punctuation,
 * path separators. Returns "project" fallback when input slugifies to empty.
 *
 * Exported for unit testing; not part of the public API.
 */
export function slugifyProjectOwnerName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

/**
 * Write a task skeleton (task.json + prd.md).
 *
 * Idempotent: if the task dir already exists, returns true without touching
 * anything. Shared by both creator bootstrap and joiner onboarding flows.
 */
function writeTaskSkeleton(
  cwd: string,
  workflowRoot: string,
  taskName: string,
  taskJson: TaskJson,
  prdContent: string,
): boolean {
  const workflowPaths = getPathsForWorkflowRoot(workflowRoot);
  const taskDir = path.join(cwd, workflowPaths.TASKS, taskName);
  if (fs.existsSync(taskDir)) return true; // idempotent

  try {
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, FILE_NAMES.TASK_JSON),
      JSON.stringify(taskJson, null, 2),
      "utf-8",
    );
    fs.writeFileSync(path.join(taskDir, FILE_NAMES.PRD), prdContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the bootstrap checklist items (previously stored as structured
 * `subtasks: [{name, status}]` in task.json). Per task 04-21-task-schema-unify
 * (D1), these live as markdown `- [ ]` items in prd.md instead, so task.json
 * stays canonical with `subtasks: string[]` (child task dir names, same as
 * task_store.py).
 */
function getBootstrapChecklistItems(
  projectType: ProjectType,
  packages?: DetectedPackage[],
): string[] {
  if (packages && packages.length > 0) {
    const items = packages.map((pkg) => `Fill guidelines for ${pkg.name}`);
    items.push("Add code examples");
    return items;
  }
  if (projectType === "frontend") {
    return ["Fill frontend guidelines", "Add code examples"];
  }
  if (projectType === "backend") {
    return ["Fill backend guidelines", "Add code examples"];
  }
  return [
    "Fill backend guidelines",
    "Fill frontend guidelines",
    "Add code examples",
  ];
}

function getBootstrapRelatedFiles(
  projectType: ProjectType,
  workflowRoot: string,
  packages?: DetectedPackage[],
): string[] {
  if (packages && packages.length > 0) {
    return packages.map(
      (pkg) => `${workflowRoot}/spec/${sanitizePkgName(pkg.name)}/`,
    );
  }
  if (projectType === "frontend") {
    return [`${workflowRoot}/spec/frontend/`];
  }
  if (projectType === "backend") {
    return [`${workflowRoot}/spec/backend/`];
  }
  return [`${workflowRoot}/spec/backend/`, `${workflowRoot}/spec/frontend/`];
}

function getBootstrapPrdContent(
  projectType: ProjectType,
  runtimeCmd: string,
  workflowRoot: string,
  packages?: DetectedPackage[],
): string {
  const checklistItems = getBootstrapChecklistItems(projectType, packages);
  const checklistMarkdown = checklistItems
    .map((item) => `- [ ] ${item}`)
    .join("\n");

  const header = `# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The project owner does not read this file.**

The project owner just ran \`harness-spec init\` on this project for the first time.
\`${workflowRoot}/\` now exists with empty spec scaffolding, and this bootstrap task
exists under \`${workflowRoot}/tasks/\`. When they want to work on it, they should start
this task from a session that provides Harness session identity.

**Your job**: help them populate \`${workflowRoot}/spec/\` with the team's real
coding conventions. Every future AI session — this project's
\`harness-implement\` and \`harness-check\` sub-agents — auto-loads spec files
listed in per-task jsonl manifests. Empty spec = sub-agents write generic
code. Real spec = sub-agents match the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

${checklistMarkdown}

---

## Spec files to populate
`;

  const backendSection = `

### Backend guidelines

| File | What to document |
|------|------------------|
| \`${workflowRoot}/spec/backend/directory-structure.md\` | Where different file types go (routes, services, utils) |
| \`${workflowRoot}/spec/backend/database-guidelines.md\` | ORM, migrations, query patterns, naming conventions |
| \`${workflowRoot}/spec/backend/error-handling.md\` | How errors are caught, logged, and returned |
| \`${workflowRoot}/spec/backend/logging-guidelines.md\` | Log levels, format, what to log |
| \`${workflowRoot}/spec/backend/quality-guidelines.md\` | Code review standards, testing requirements |
`;

  const frontendSection = `

### Frontend guidelines

| File | What to document |
|------|------------------|
| \`${workflowRoot}/spec/frontend/directory-structure.md\` | Component/page/hook organization |
| \`${workflowRoot}/spec/frontend/component-guidelines.md\` | Component patterns, props conventions |
| \`${workflowRoot}/spec/frontend/hook-guidelines.md\` | Custom hook naming, patterns |
| \`${workflowRoot}/spec/frontend/state-management.md\` | State library, patterns, what goes where |
| \`${workflowRoot}/spec/frontend/type-safety.md\` | TypeScript conventions, type organization |
| \`${workflowRoot}/spec/frontend/quality-guidelines.md\` | Linting, testing, accessibility |
`;

  const footer = `

### Thinking guides (already populated)

\`${workflowRoot}/spec/guides/\` contains general thinking guides pre-filled with
best practices. Customize only if something clearly doesn't fit this project.

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching \`${workflowRoot}/spec/\` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| \`CLAUDE.md\` / \`CLAUDE.local.md\` | Claude Code |
| \`AGENTS.md\` | Codex / Claude Code / agent-compatible tools |
| \`.cursorrules\` | Cursor |
| \`.cursor/rules/*.mdc\` | Cursor (rules directory) |
| \`.windsurfrules\` | Windsurf |
| \`.clinerules\` | Cline |
| \`.roomodes\` | Roo Code |
| \`.github/copilot-instructions.md\` | GitHub Copilot |
| \`.vscode/settings.json\` → \`github.copilot.chat.codeGeneration.instructions\` | VS Code Copilot |
| \`CONVENTIONS.md\` / \`.aider.conf.yml\` | aider |
| \`CONTRIBUTING.md\` | General project conventions |
| \`.editorconfig\` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every AI coding task spawns two sub-agents: \`harness-implement\` (writes
  code) and \`harness-check\` (verifies quality).
- Each task has \`implement.jsonl\` / \`check.jsonl\` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's \`prd.md\`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: \`${workflowRoot}/spec/\`. That's why filling it well now pays
  off forever.

---

## Completion

When the project owner confirms the checklist items above are done with real
examples (not placeholders), guide them to run:

\`\`\`bash
${runtimeCmd} ./${workflowRoot}/scripts/task.js finish
${runtimeCmd} ./${workflowRoot}/scripts/task.js archive 00-bootstrap-guidelines
\`\`\`

After archive, every new project owner who joins this project will get a
\`00-join-<slug>\` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to Harness Spec! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"
`;

  let content = header;

  if (packages && packages.length > 0) {
    // Monorepo: generate per-package sections
    for (const pkg of packages) {
      const pkgType = pkg.type === "unknown" ? "fullstack" : pkg.type;
      const specName = sanitizePkgName(pkg.name);
      content += `\n### Package: ${pkg.name} (\`spec/${specName}/\`)\n`;
      if (pkgType !== "frontend") {
        content += `\n- Backend guidelines: \`${workflowRoot}/spec/${specName}/backend/\`\n`;
      }
      if (pkgType !== "backend") {
        content += `\n- Frontend guidelines: \`${workflowRoot}/spec/${specName}/frontend/\`\n`;
      }
    }
  } else if (projectType === "frontend") {
    content += frontendSection;
  } else if (projectType === "backend") {
    content += backendSection;
  } else {
    // fullstack
    content += backendSection;
    content += frontendSection;
  }
  content += footer;

  return content;
}

function getBootstrapTaskJson(
  projectOwner: string,
  projectType: ProjectType,
  workflowRoot: string,
  packages?: DetectedPackage[],
): TaskJson {
  const today = new Date().toISOString().split("T")[0];
  const relatedFiles = getBootstrapRelatedFiles(
    projectType,
    workflowRoot,
    packages,
  );

  // Canonical 24-field shape via emptyTaskJson factory.
  // Checklist items (previously stored as structured `subtasks`) are now
  // rendered as `- [ ]` items in prd.md; task.json.subtasks is always
  // string[] (child task dir names) per the canonical schema.
  return emptyTaskJson({
    id: BOOTSTRAP_TASK_NAME,
    name: BOOTSTRAP_TASK_NAME,
    title: "Bootstrap Guidelines",
    description: "Fill in project development guidelines for AI agents",
    status: "in_progress",
    dev_type: "docs",
    priority: "P1",
    creator: projectOwner,
    assignee: projectOwner,
    createdAt: today,
    relatedFiles,
    notes: `First-time setup task created by harness-spec init (${projectType} project)`,
  });
}

/**
 * Create bootstrap task for first-time setup
 */
function createBootstrapTask(
  cwd: string,
  workflowRoot: string,
  projectOwner: string,
  runtimeCmd: string,
  projectType: ProjectType,
  packages?: DetectedPackage[],
): boolean {
  const taskJson = getBootstrapTaskJson(
    projectOwner,
    projectType,
    workflowRoot,
    packages,
  );
  const prdContent = getBootstrapPrdContent(
    projectType,
    runtimeCmd,
    workflowRoot,
    packages,
  );
  return writeTaskSkeleton(
    cwd,
    workflowRoot,
    BOOTSTRAP_TASK_NAME,
    taskJson,
    prdContent,
  );
}

// =============================================================================
// Joiner Onboarding Task Creation
// =============================================================================

/**
 * task.json factory for joiner onboarding. Mirrors the bootstrap factory but
 * uses dev_type "docs", higher priority "P1", and the project-specific task
 * name (so multiple joiners in the same checkout don't collide).
 */
function getJoinerTaskJson(projectOwner: string, taskName: string): TaskJson {
  const today = new Date().toISOString().split("T")[0];
  return emptyTaskJson({
    id: taskName,
    name: taskName,
    title: `Joining: Onboard to this Harness Spec project (${projectOwner})`,
    description:
      "Onboard a new project owner to an existing Harness Spec project: learn the workflow, conventions, and find assigned work",
    status: "in_progress",
    dev_type: "docs",
    priority: "P1",
    creator: projectOwner,
    assignee: projectOwner,
    createdAt: today,
    notes:
      "Generated by harness-spec init for a new project owner joining an existing Harness Spec project",
  });
}

/**
 * PRD content for joiner onboarding. Kept concise (~80 lines) — deeper
 * guidance lives in skills and docs.
 */
function getJoinerPrdContent(
  projectOwner: string,
  runtimeCmd: string,
  workflowRoot: string,
): string {
  const slug = slugifyProjectOwnerName(projectOwner);
  return `# Joiner Onboarding Task

**You (the AI) are running this task. The project owner does not read this file.**

\`${projectOwner}\` just ran \`harness-spec init\` on a fresh clone, saw "Project
initialized", and will now start asking you questions in chat. This joiner task
exists under \`${workflowRoot}/tasks/\`; when they want to work on it, they should
start it from a session that provides Harness session identity.

Your job is to orient them to Harness Spec. Don't dump all of this at them — open
with a short greeting, ask where they want to start, and fill in the rest as
they engage.

---

## Topics to cover (adapt order to their questions)

### 1. What Harness Spec is + the workflow

Harness Spec is a workflow layer over Claude Code / Cursor / etc. that keeps AI
agents consistent with project-specific conventions instead of writing generic
code every session.

- **Three phases**: Plan (brainstorm → \`prd.md\`) → Execute (code + check) →
  Finish (capture + wrap). Full reference: \`${workflowRoot}/workflow.md\`.
- **Task lifecycle**: planning → in_progress → done → archive, under
  \`${workflowRoot}/tasks/\`.
- **Core slash commands**:
  - \`/harness-spec:continue\` — resume the current session's active task
  - \`/harness-spec:finish-work\` — wrap up a finished task
  - \`/harness-spec:start\` — session boot from scratch (not needed here; the
    SessionStart hook does its job automatically)

### 2. Runtime mechanics (explain when they ask "how does it know what to do")

- **SessionStart hook** runs \`get_context.js\` and injects identity, git
  status, session active task, active tasks, and workflow phase into the AI
  conversation at every session start.
- **\`<workflow-state>\` tag** is auto-injected with every user message,
  carrying the current task + phase hint.
- **\`/harness-spec:continue\`** loads the Phase Index, reads \`prd.md\` + recent
  activity, and routes to the right skill (\`harness-brainstorm\` for planning,
  \`harness-implement\` for coding, \`harness-check\` for verification).
- **\`harness-implement\` sub-agent** is spawned when code needs to be written.
  The platform hook reads \`{TASK_DIR}/implement.jsonl\` and auto-injects those
  spec files + \`prd.md\` into the sub-agent's prompt so it codes per project
  conventions.
- **\`harness-check\` sub-agent** follows the same pattern with \`check.jsonl\`
  — reviews changes against specs, auto-fixes issues, runs lint/typecheck.

File layout (mention when they ask "where does what live"):
- \`${workflowRoot}/.runtime/sessions/<session>.json\` — session active-task state, gitignored
- \`${workflowRoot}/tasks/<task>/{implement,check}.jsonl\` — per-task context manifests
- \`${workflowRoot}/spec/\` — project-wide conventions (source of truth)
- \`${workflowRoot}/workspace/${projectOwner}/journal-*.md\` — their session log,
  rotated at ~2000 lines

### 3. This project's actual conventions

- Summarize \`${workflowRoot}/spec/\` for them — what coding conventions this
  specific team enforces.
- Point at the last 5 entries in \`${workflowRoot}/tasks/archive/\` as a rhythm
  example of how people actually work here. **If archive is empty** (the
  project just started), skip this — don't invent examples.
- Not your job in this onboarding to teach them the business code itself —
  the README and their teammates handle that.

### 4. Their assigned work

- Check if \`${workflowRoot}/workspace/${projectOwner}/\` already exists — if yes, it's
  their journal from another machine and worth mentioning.
- Run \`${runtimeCmd} ./${workflowRoot}/scripts/task.js list --assignee ${projectOwner}\` to
  show tasks assigned to them. (Quote the name if it contains spaces.)
- Remind them that the "My Tasks" section appears in the SessionStart context
  on every new session.

---

## Optional: walk through a small task end-to-end

If they want to practice before touching real work, offer to pick a tiny
P3 task or a typo fix and run the full cycle together: \`/harness-spec:continue\`
→ you implement via sub-agents → \`/harness-spec:finish-work\`.

---

## Completion

When they feel oriented (or after you've covered the four topics with
reasonable back-and-forth), guide them to run:

\`\`\`bash
${runtimeCmd} ./${workflowRoot}/scripts/task.js finish
${runtimeCmd} ./${workflowRoot}/scripts/task.js archive 00-join-${slug}
\`\`\`

---

## Suggested opening line

"Welcome! Your \`harness-spec init\` set me up to onboard you to this project. I
can walk you through the workflow, show you the runtime mechanics under the
hood, summarize the team's spec, or jump to what you're already curious about
— which would you prefer?"
`;
}

/**
 * Create joiner onboarding task for a new checkout owner on an existing
 * Harness Spec project. Task name is slugified to be filesystem-safe for
 * arbitrary project personalization names (spaces, Unicode, punctuation).
 */
function createJoinerOnboardingTask(
  cwd: string,
  workflowRoot: string,
  projectOwner: string,
  runtimeCmd: string,
): boolean {
  const slug = slugifyProjectOwnerName(projectOwner);
  const taskName = `00-join-${slug}`;
  const taskJson = getJoinerTaskJson(projectOwner, taskName);
  const prdContent = getJoinerPrdContent(projectOwner, runtimeCmd, workflowRoot);
  return writeTaskSkeleton(cwd, workflowRoot, taskName, taskJson, prdContent);
}

interface InitOptions {
  claude?: boolean;
  codex?: boolean;
  gemini?: boolean;
  yes?: boolean;
  project?: string;
  lang?: string;
  force?: boolean;
  skipExisting?: boolean;
  template?: string;
  overwrite?: boolean;
  append?: boolean;
  registry?: string;
  monorepo?: boolean;
}

// Compile-time check: every CliFlag must be a key of InitOptions.
// If a new platform is added to CliFlag but not to InitOptions, this line errors.
// Uses [X] extends [Y] to prevent distributive conditional behavior.
type _AssertCliFlagsInOptions = [CliFlag] extends [keyof InitOptions]
  ? true
  : "ERROR: CliFlag has values not present in InitOptions";
const _cliFlagCheck: _AssertCliFlagsInOptions = true;

/**
 * Write monorepo package configuration to config.yaml (non-destructive patch).
 * Appends packages: and default_package: without disturbing existing config.
 */
function writeMonorepoConfig(
  cwd: string,
  workflowRoot: string,
  packages: DetectedPackage[],
): void {
  const configPath = path.join(cwd, workflowRoot, "config.yaml");
  let content = "";

  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    // Config not created yet; will be created by createWorkflowStructure
    return;
  }

  // Don't overwrite if packages: already exists (re-init case)
  if (/^packages\s*:/m.test(content)) {
    return;
  }

  const lines = ["\n# Auto-detected monorepo packages", "packages:"];
  for (const pkg of packages) {
    lines.push(`  ${sanitizePkgName(pkg.name)}:`);
    lines.push(`    path: ${pkg.path}`);
    if (pkg.isSubmodule) {
      lines.push("    type: submodule");
    } else if (pkg.isGitRepo) {
      lines.push("    git: true");
    }
  }

  // Use first non-submodule package as default, fallback to first package
  const defaultPkg =
    packages.find((p) => !p.isSubmodule)?.name ?? packages[0]?.name;
  if (defaultPkg) {
    lines.push(`default_package: ${defaultPkg}`);
  }

  fs.writeFileSync(
    configPath,
    content.trimEnd() + "\n" + lines.join("\n") + "\n",
    "utf-8",
  );
}

interface InitAnswers {
  tools: string[];
  template?: string;
  existingDirAction?: TemplateStrategy;
}

export type TemplateLanguage = "en" | "cn";

function normalizeTemplateLanguage(input: string | undefined): TemplateLanguage {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) {
    throw new Error("harness-spec init requires -l, --lang <en|cn>.");
  }
  if (normalized !== "en" && normalized !== "cn") {
    throw new Error("Unsupported language. Use -l, --lang <en|cn>.");
  }
  return normalized;
}

interface HarnessPackageJson {
  harness?: {
    "spec-name"?: string;
    language?: TemplateLanguage;
  };
  [key: string]: unknown;
}

function readPackageJson(cwd: string): HarnessPackageJson | null {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(
      fs.readFileSync(packageJsonPath, "utf-8"),
    ) as HarnessPackageJson;
  } catch {
    return null;
  }
}

function getRecordedWorkflowRoot(cwd: string): string | null {
  const packageJson = readPackageJson(cwd);
  const specName = packageJson?.harness?.["spec-name"]?.trim();
  if (!specName) {
    return null;
  }
  return getWorkflowDir(specName);
}

function writeHarnessConfig(
  cwd: string,
  project: string,
  language: TemplateLanguage,
): void {
  const packageJsonPath = path.join(cwd, "package.json");
  const existing = readPackageJson(cwd) ?? {};
  const next: HarnessPackageJson = {
    ...existing,
    harness: {
      ...(existing.harness ?? {}),
      "spec-name": project,
      language,
    },
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
}

function initializeProjectOwnerRecord(
  cwd: string,
  workflowRoot: string,
  projectOwnerName: string,
): void {
  const workflowPaths = getPathsForWorkflowRoot(workflowRoot);
  fs.mkdirSync(path.join(cwd, workflowPaths.WORKSPACE, projectOwnerName), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(cwd, workflowPaths.PROJECT_OWNER_FILE),
    `name=${projectOwnerName}\ninitialized_at=${new Date().toISOString()}\n`,
    "utf-8",
  );
}

export async function init(options: InitOptions): Promise<void> {
  // Refuse to run in $HOME — running here would scoop platform runtime data
  // (Claude/Codex/OpenCode session histories etc.) into the workflow hash
  // manifest, and a subsequent `harness-spec uninstall` would wipe it.
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("init")));
    process.exit(1);
  }

  const cwd = process.cwd();
  let projectOwnerName = options.project?.trim();
  if (!projectOwnerName) {
    throw new Error("harness-spec init requires -p, --project <name>.");
  }
  const templateLanguage = normalizeTemplateLanguage(options.lang);

  const recordedWorkflowRoot = getRecordedWorkflowRoot(cwd);
  const workflowRoot = recordedWorkflowRoot ?? getWorkflowDir(projectOwnerName);
  const workflowPaths = getPathsForWorkflowRoot(workflowRoot);
  const isFirstInit = !fs.existsSync(path.join(cwd, workflowRoot));
  const isRecordedProjectInit =
    !!recordedWorkflowRoot && fs.existsSync(path.join(cwd, recordedWorkflowRoot));

  if (isRecordedProjectInit) {
    throw new Error(
      `Harness Spec is already initialized in this project. Run "harness-spec update" instead.`,
    );
  }

  // Generate ASCII art banner dynamically using FIGlet "Rebel" font
  const banner = figlet.textSync("Harness", { font: "Rebel" });
  console.log(chalk.cyan(`\n${banner.trimEnd()}`));
  console.log(
    chalk.gray(
      "\n   Personalized AI workflow toolkit for Claude, Codex, and Gemini\n",
    ),
  );

  // Set up proxy before any network calls
  const proxyUrl = setupProxy();
  if (proxyUrl) {
    console.log(chalk.gray(`   Using proxy: ${maskProxyUrl(proxyUrl)}\n`));
  }

  // Set write mode based on options
  let writeMode: WriteMode = "ask";
  if (options.force) {
    writeMode = "force";
    console.log(chalk.gray("Mode: Force overwrite existing files\n"));
  } else if (options.skipExisting) {
    writeMode = "skip";
    console.log(chalk.gray("Mode: Skip existing files\n"));
  } else if (options.yes) {
    // -y implies non-interactive: never prompt on conflicts. Default to skip
    // (preserve user files) — explicit --force is required to overwrite.
    writeMode = "skip";
    console.log(chalk.gray("Mode: Non-interactive (skip existing files)\n"));
  }
  setWriteMode(writeMode);

  // Detect project name from options / recorded metadata
  if (projectOwnerName) {
    console.log(chalk.blue("📁 Project:"), chalk.gray(projectOwnerName));
  }
  const runtimeCommand = "node";
  setResolvedWorkflowRoot(workflowRoot);

  // Detect project type (silent - no output)
  const detectedType = detectProjectType(cwd);

  // Parse custom registry source early (needed by both monorepo + single-repo flows)
  let registry: RegistrySource | undefined;
  if (options.registry) {
    try {
      registry = parseRegistrySource(options.registry);
    } catch (error) {
      console.log(
        chalk.red(
          error instanceof Error ? error.message : "Invalid registry source",
        ),
      );
      return;
    }
  }

  // Determine template strategy from flags (needed before monorepo template downloads)
  let templateStrategy: TemplateStrategy = "skip";
  if (options.overwrite) {
    templateStrategy = "overwrite";
  } else if (options.append) {
    templateStrategy = "append";
  }

  // ==========================================================================
  // Monorepo Detection
  // ==========================================================================

  let monorepoPackages: DetectedPackage[] | undefined;
  let remoteSpecPackages: Set<string> | undefined;

  if (options.monorepo !== false) {
    // options.monorepo: true = --monorepo, false = --no-monorepo, undefined = auto
    const detected = detectMonorepo(cwd);

    if (options.monorepo === true && !detected) {
      console.log(
        chalk.red(
          "Error: --monorepo specified but no multi-package layout detected.",
        ),
      );
      console.log("");
      console.log(chalk.gray("Checked:"));
      console.log(chalk.gray("  ✗ pnpm-workspace.yaml"));
      console.log(chalk.gray("  ✗ package.json workspaces"));
      console.log(chalk.gray("  ✗ Cargo.toml [workspace]"));
      console.log(chalk.gray("  ✗ go.work"));
      console.log(chalk.gray("  ✗ pyproject.toml [tool.uv.workspace]"));
      console.log(chalk.gray("  ✗ .gitmodules"));
      console.log(chalk.gray("  ✗ sibling .git directories (need ≥ 2)"));
      console.log("");
      console.log(`To configure manually, add to ${workflowRoot}/config.yaml:`);
      console.log("");
      console.log(chalk.cyan("  packages:"));
      console.log(chalk.cyan("    frontend:"));
      console.log(chalk.cyan("      path: ./frontend"));
      console.log(chalk.cyan("      git: true       # if it has its own .git"));
      console.log(chalk.cyan("    backend:"));
      console.log(chalk.cyan("      path: ./backend"));
      console.log(chalk.cyan("      git: true"));
      return;
    }

    if (detected && detected.length > 0) {
      let enableMonorepo = false;

      if (options.monorepo === true || options.yes) {
        enableMonorepo = true;
      } else {
        // Show detected packages and ask
        console.log(chalk.blue("\n🔍 Detected monorepo packages:"));
        for (const pkg of detected) {
          const tag = pkg.isSubmodule
            ? chalk.gray(" (submodule)")
            : pkg.isGitRepo
              ? chalk.gray(" (git repo)")
              : "";
          console.log(
            chalk.gray(`   - ${pkg.name}`) +
              chalk.gray(` (${pkg.path})`) +
              chalk.gray(` [${pkg.type}]`) +
              tag,
          );
        }
        console.log("");

        const { useMonorepo } = await inquirer.prompt<{
          useMonorepo: boolean;
        }>([
          {
            type: "confirm",
            name: "useMonorepo",
            message: "Enable monorepo mode?",
            default: true,
          },
        ]);
        enableMonorepo = useMonorepo;
      }

      if (enableMonorepo) {
        monorepoPackages = detected;
        remoteSpecPackages = new Set<string>();

        // Per-package template selection (unless -y mode: all use blank spec)
        if (!options.yes && !options.template) {
          for (const pkg of detected) {
            const { specSource } = await inquirer.prompt<{
              specSource: string;
            }>([
              {
                type: "list",
                name: "specSource",
                message: `Spec source for ${pkg.name} (${pkg.path}):`,
                choices: [
                  { name: "From scratch (Harness default)", value: "blank" },
                  { name: "Download remote template", value: "remote" },
                ],
                default: "blank",
              },
            ]);

            if (specSource === "remote") {
              // Use existing template download flow, targeting spec/<name>/
              const destDir = path.join(
                cwd,
                workflowPaths.SPEC,
                sanitizePkgName(pkg.name),
              );
              console.log(chalk.blue(`📦 Select template for ${pkg.name}...`));
              // Fetch templates if not already done
              const templates = await fetchTemplateIndex();
              const specTemplates = templates
                .filter((t) => t.type === "spec")
                .map((t) => ({
                  name: `${t.id} (${t.name})`,
                  value: t.id,
                }));

              if (specTemplates.length > 0) {
                const { templateId } = await inquirer.prompt<{
                  templateId: string;
                }>([
                  {
                    type: "list",
                    name: "templateId",
                    message: `Select template for ${pkg.name}:`,
                    choices: specTemplates,
                  },
                ]);

                const result = await downloadTemplateById(
                  cwd,
                  templateId,
                  templateStrategy,
                  templates.find((t) => t.id === templateId),
                  undefined,
                  destDir,
                );

                if (result.success) {
                  console.log(chalk.green(`   ${result.message}`));
                  remoteSpecPackages.add(sanitizePkgName(pkg.name));
                } else {
                  console.log(chalk.yellow(`   ${result.message}`));
                  console.log(chalk.gray("   Falling back to blank spec..."));
                }
              } else {
                console.log(
                  chalk.gray("   No templates available. Using blank spec."),
                );
              }
            }
          }
        } else if (options.template) {
          // --template as default for all packages
          for (const pkg of detected) {
            const destDir = path.join(
              cwd,
              workflowPaths.SPEC,
              sanitizePkgName(pkg.name),
            );
            const result = await downloadTemplateById(
              cwd,
              options.template,
              templateStrategy,
              undefined,
              registry,
              destDir,
            );
            if (result.success && !result.skipped) {
              remoteSpecPackages.add(sanitizePkgName(pkg.name));
            }
          }
        }
      }
    }
  }

  // Tool definitions derived from platform registry
  const TOOLS = getInitToolChoices();

  // Build tools from explicit flags
  const explicitTools = TOOLS.filter(
    (t) => options[t.key as keyof InitOptions],
  ).map((t) => t.key);

  let tools: string[];

  if (explicitTools.length > 0) {
    // Explicit flags take precedence (works with or without -y)
    tools = explicitTools;
  } else if (options.yes) {
    // No explicit tools + -y: use supported-platform defaults
    tools = TOOLS.filter((t) => t.defaultChecked).map((t) => t.key);
  } else {
    // Interactive mode
    const answers = await inquirer.prompt<InitAnswers>([
      {
        type: "checkbox",
        name: "tools",
        message: "Select AI tools to configure:",
        choices: TOOLS.map((t) => ({
          name: t.name,
          value: t.key,
          checked: t.defaultChecked,
        })),
      },
    ]);
    tools = answers.tools;
  }

  // Treat unknown project type as fullstack
  const projectType: ProjectType =
    detectedType === "unknown" ? "fullstack" : detectedType;

  if (tools.length === 0) {
    console.log(
      chalk.yellow("No tools selected. At least one tool is required."),
    );
    return;
  }

  // ==========================================================================
  // Template Selection (single-repo only; monorepo handles templates above)
  // ==========================================================================

  let selectedTemplate: string | null = null;

  // Pre-fetched templates list (used to pass selected SpecTemplate to downloadTemplateById)
  let fetchedTemplates: SpecTemplate[] = [];
  let registryBackend: RegistryBackend | undefined;

  // Determine the index URL based on registry
  const indexUrl = registry
    ? `${registry.rawBaseUrl}/index.json`
    : TEMPLATE_INDEX_URL;

  if (monorepoPackages) {
    // Monorepo: template selection already handled above
  } else if (options.template) {
    // Template specified via --template flag
    selectedTemplate = options.template;
  } else if (!options.yes) {
    // Interactive mode: show template selection
    const timeoutSec = TIMEOUTS.INDEX_FETCH_MS / 1000;
    const sourceLabel = registry ? registry.gigetSource : TEMPLATE_INDEX_URL;
    console.log(
      chalk.gray(`   Fetching available templates from ${sourceLabel}`),
    );
    let elapsed = 0;
    const ticker = setInterval(() => {
      elapsed++;
      process.stdout.write(
        `\r${chalk.gray(`   Loading... ${elapsed}s/${timeoutSec}s`)}`,
      );
    }, 1000);
    process.stdout.write(chalk.gray(`   Loading... 0s/${timeoutSec}s`));
    let templates: SpecTemplate[];
    let registryProbeNotFound = false;
    let registryProbeError: Error | undefined;
    if (registry) {
      const probeResult = await probeRegistryIndex(indexUrl, registry);
      templates = probeResult.templates;
      registryProbeNotFound = probeResult.isNotFound;
      registryProbeError = probeResult.error;
      registryBackend = probeResult.backend;
    } else {
      templates = await fetchTemplateIndex(indexUrl);
    }
    clearInterval(ticker);
    // Clear the loading line
    process.stdout.write("\r\x1b[2K");
    fetchedTemplates = templates;

    if (templates.length === 0 && registry && registryProbeNotFound) {
      // Custom registry: confirmed no index.json — will try direct download later
      console.log(
        chalk.gray(
          "   No index.json found at registry. Will download as direct spec template.",
        ),
      );
    } else if (templates.length === 0 && registry) {
      // Custom registry: transient error (not a 404) — abort, don't misclassify
      console.log(
        chalk.red(
          `   ${registryProbeError?.message ?? "Could not reach registry. Check your connection and try again."}`,
        ),
      );
      return;
    } else if (templates.length === 0) {
      console.log(
        chalk.gray(
          "   Could not fetch templates (offline or server unavailable).",
        ),
      );
      console.log(chalk.gray("   Using blank templates.\n"));
    }

    if (templates.length > 0) {
      // Build template choices
      const specTemplates = templates
        .filter((t) => t.type === "spec")
        .map((t) => ({
          name: `${t.id} (${t.name})`,
          value: t.id,
        }));

      const templateChoices = registry
        ? specTemplates
        : [
            {
              name: "from scratch (default)",
              value: "blank",
            },
            ...specTemplates,
            {
              name: "custom (enter a registry source)",
              value: "__custom__",
            },
          ];

      // Loop to allow returning from custom source input back to the picker
      let templatePicked = false;
      while (templateChoices.length > 0 && !templatePicked) {
        const templateAnswer = await inquirer.prompt<{ template: string }>([
          {
            type: "list",
            name: "template",
            message: "Select a spec template:",
            choices: templateChoices,
            default: registry ? undefined : "blank",
          },
        ]);

        if (templateAnswer.template === "__custom__") {
          // Prompt for custom registry source (empty → back to picker)
          const customSource = await askInput(
            "Enter registry source (e.g., gh:myorg/myrepo/specs), or press Enter to go back: ",
          );
          if (!customSource) {
            continue; // Back to picker
          }
          try {
            registry = parseRegistrySource(customSource);
            fetchedTemplates = []; // Reset so direct-download guard works correctly
            // Probe index.json to detect marketplace vs direct download
            const customIndexUrl = `${registry.rawBaseUrl}/index.json`;
            console.log(
              chalk.gray(
                `   Checking for templates at ${registry.gigetSource}...`,
              ),
            );
            const customProbe = await probeRegistryIndex(
              customIndexUrl,
              registry,
            );
            const customTemplates = customProbe.templates;
            registryBackend = customProbe.backend;
            if (customTemplates.length > 0) {
              // Marketplace mode: show picker with custom templates
              fetchedTemplates = customTemplates;
              const customChoices = customTemplates
                .filter((t) => t.type === "spec")
                .map((t) => ({
                  name: `${t.id} (${t.name})`,
                  value: t.id,
                }));
              if (customChoices.length > 0) {
                const customAnswer = await inquirer.prompt<{
                  template: string;
                }>([
                  {
                    type: "list",
                    name: "template",
                    message: "Select a spec template:",
                    choices: customChoices,
                  },
                ]);
                selectedTemplate = customAnswer.template;

                // Check if spec directory already exists and ask what to do
                const specDir = path.join(cwd, workflowPaths.SPEC);
                if (
                  fs.existsSync(specDir) &&
                  !options.overwrite &&
                  !options.append
                ) {
                  const actionAnswer = await inquirer.prompt<{
                    action: TemplateStrategy;
                  }>([
                    {
                      type: "list",
                      name: "action",
                      message: `Directory ${workflowPaths.SPEC} already exists. What do you want to do?`,
                      choices: [
                        { name: "Skip (keep existing)", value: "skip" },
                        {
                          name: "Overwrite (replace all)",
                          value: "overwrite",
                        },
                        {
                          name: "Append (add missing files only)",
                          value: "append",
                        },
                      ],
                      default: "skip",
                    },
                  ]);
                  templateStrategy = actionAnswer.action;
                }
              }
              templatePicked = true;
            } else if (customProbe.isNotFound) {
              // No index.json → direct download mode
              templatePicked = true;
            } else {
              // Transient error (not 404) — loop back, don't misclassify
              console.log(
                chalk.yellow(
                  `   ${customProbe.error?.message ?? "Could not reach registry. Try again or enter a different source."}`,
                ),
              );
              registry = undefined; // Reset so we don't fall through to direct download
            }
          } catch (error) {
            console.log(
              chalk.red(
                error instanceof Error
                  ? error.message
                  : "Invalid registry source",
              ),
            );
            // Loop back to picker
          }
        } else {
          templatePicked = true;
          if (templateAnswer.template !== "blank") {
            selectedTemplate = templateAnswer.template;

            // Check if spec directory already exists and ask what to do
            const specDir = path.join(cwd, workflowPaths.SPEC);
            if (
              fs.existsSync(specDir) &&
              !options.overwrite &&
              !options.append
            ) {
              const actionAnswer = await inquirer.prompt<{
                action: TemplateStrategy;
              }>([
                {
                  type: "list",
                  name: "action",
                  message: `Directory ${workflowPaths.SPEC} already exists. What do you want to do?`,
                  choices: [
                    { name: "Skip (keep existing)", value: "skip" },
                    { name: "Overwrite (replace all)", value: "overwrite" },
                    {
                      name: "Append (add missing files only)",
                      value: "append",
                    },
                  ],
                  default: "skip",
                },
              ]);
              templateStrategy = actionAnswer.action;
            }
          }
        }
      }
    }
  }
  // -y mode with --registry (no --template): probe index.json to detect mode
  // Skip when monorepo mode already handled templates above
  if (options.yes && registry && !selectedTemplate && !monorepoPackages) {
    const probeResult = await probeRegistryIndex(
      `${registry.rawBaseUrl}/index.json`,
      registry,
    );
    registryBackend = probeResult.backend;
    if (probeResult.templates.length > 0) {
      // Marketplace mode requires interactive selection — can't auto-select
      console.log(
        chalk.red(
          "Error: Registry is a marketplace with multiple templates. " +
            "Use --template <id> to specify which one, or remove -y for interactive selection.",
        ),
      );
      return;
    }
    if (!probeResult.isNotFound) {
      // Transient error (not 404) — abort, don't misclassify as direct-download
      console.log(
        chalk.red(
          `Error: ${probeResult.error?.message ?? "Could not reach registry. Check your connection and try again."}`,
        ),
      );
      return;
    }
    // isNotFound=true → no index.json, proceed with direct download (fetchedTemplates stays empty)
  }

  // ==========================================================================
  // Download Remote Template (if selected or direct registry download)
  // ==========================================================================

  let useRemoteTemplate = false;

  if (selectedTemplate) {
    // Marketplace mode: download specific template by ID
    console.log(chalk.blue(`📦 Downloading template "${selectedTemplate}"...`));
    console.log(chalk.gray("   This may take a moment on slow connections."));

    // Find pre-fetched SpecTemplate to avoid double-fetch
    const prefetched = fetchedTemplates.find((t) => t.id === selectedTemplate);

    const result = await downloadTemplateById(
      cwd,
      selectedTemplate,
      templateStrategy,
      prefetched,
      registry,
      undefined,
      registryBackend,
    );

    if (result.success) {
      if (result.skipped) {
        console.log(chalk.gray(`   ${result.message}`));
      } else {
        console.log(chalk.green(`   ${result.message}`));
        useRemoteTemplate = true;
      }
    } else {
      console.log(chalk.yellow(`   ${result.message}`));
      console.log(chalk.gray("   Falling back to blank templates..."));
      const retryCmd = registry
        ? `harness-spec init --registry ${registry.gigetSource} --template ${selectedTemplate}`
        : `harness-spec init --template ${selectedTemplate}`;
      console.log(chalk.gray(`   You can retry later: ${retryCmd}`));
    }
  } else if (registry && fetchedTemplates.length === 0) {
    // Direct download mode: registry has no index.json, download directory directly
    console.log(
      chalk.blue(`📦 Downloading spec from ${registry.gigetSource}...`),
    );
    console.log(chalk.gray("   This may take a moment on slow connections."));

    // Ask about existing spec dir in interactive mode
    if (!options.yes && !options.overwrite && !options.append) {
      const specDir = path.join(cwd, workflowPaths.SPEC);
      if (fs.existsSync(specDir)) {
        const actionAnswer = await inquirer.prompt<{
          action: TemplateStrategy;
        }>([
          {
            type: "list",
            name: "action",
            message: `Directory ${workflowPaths.SPEC} already exists. What do you want to do?`,
            choices: [
              { name: "Skip (keep existing)", value: "skip" },
              { name: "Overwrite (replace all)", value: "overwrite" },
              { name: "Append (add missing files only)", value: "append" },
            ],
            default: "skip",
          },
        ]);
        templateStrategy = actionAnswer.action;
      }
    }

    const result = await downloadRegistryDirect(
      cwd,
      registry,
      templateStrategy,
      undefined,
      registryBackend,
    );

    if (result.success) {
      if (result.skipped) {
        console.log(chalk.gray(`   ${result.message}`));
      } else {
        console.log(chalk.green(`   ${result.message}`));
        useRemoteTemplate = true;
      }
    } else {
      console.log(chalk.yellow(`   ${result.message}`));
      console.log(chalk.gray("   Falling back to blank templates..."));
      console.log(
        chalk.gray(
          `   You can retry later: harness-spec init --registry ${registry.gigetSource}`,
        ),
      );
    }
  }

  // ==========================================================================
  // Create Workflow Structure
  // ==========================================================================

  // Record every successful write from here through createRootFiles. The
  // captured set is the source of truth for `.template-hashes.json`'s
  // platform/root entries — replacing the previous "walk every managed dir"
  // approach that swept user-owned runtime files into the manifest
  // (.codex/sessions/, .claude/projects/, pre-existing AGENTS.md).
  const writtenPaths = startRecordingWrites(cwd);
  try {
    if (!recordedWorkflowRoot) {
      writeHarnessConfig(cwd, projectOwnerName, templateLanguage);
    }
    // Create workflow structure with project type
    console.log(chalk.blue("📁 Creating workflow structure..."));
    await createWorkflowStructure(cwd, {
      projectType,
      workflowRoot,
      language: templateLanguage,
      skipSpecTemplates: useRemoteTemplate,
      packages: monorepoPackages,
      remoteSpecPackages,
    });

    // Write monorepo packages to config.yaml (non-destructive patch)
    if (monorepoPackages) {
      writeMonorepoConfig(cwd, workflowRoot, monorepoPackages);
      console.log(chalk.blue("📦 Monorepo packages written to config.yaml"));
    }

    // Write version file for update tracking
    const versionPath = path.join(cwd, workflowRoot, ".version");
    fs.writeFileSync(versionPath, VERSION);

    // Configure selected tools by copying entire directories (dogfooding)
    for (const tool of tools) {
      const platformId = resolveCliFlag(tool);
      if (platformId) {
        console.log(
          chalk.blue(`📝 Configuring ${AI_TOOLS[platformId].name}...`),
        );
            await configurePlatform(platformId, cwd, templateLanguage);
      }
    }

    if (tools.length > 0) {
      logRuntimeAdaptationNotice(runtimeCommand);
    }

    // Create root files (skip if exists)
    await createRootFiles(cwd, workflowRoot, templateLanguage);
  } finally {
    stopRecordingWrites();
  }

  // Initialize template hashes for modification tracking
  const hashedCount = initializeHashes(cwd, { trackedPaths: writtenPaths });
  if (hashedCount > 0) {
    console.log(
      chalk.gray(`📋 Tracking ${hashedCount} template files for updates`),
    );
  }

  // Initialize project owner record (silent - no output)
  if (projectOwnerName) {
    initializeProjectOwnerRecord(cwd, workflowRoot, projectOwnerName);

    // Bootstrap guidance is created only for a brand-new initialization.
    const tasksDir = path.join(cwd, workflowRoot, DIR_NAMES.TASKS);
    const tasksEmpty =
      !fs.existsSync(tasksDir) || fs.readdirSync(tasksDir).length === 0;

    if (isFirstInit || tasksEmpty) {
      createBootstrapTask(
        cwd,
        workflowRoot,
        projectOwnerName,
        runtimeCommand,
        projectType,
        monorepoPackages,
      );
    }
  }
}

/**
 * Simple readline-based input (no flickering like inquirer)
 */
function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function createRootFiles(
  cwd: string,
  workflowRoot: string,
  language: TemplateLanguage,
): Promise<void> {
  const agentsPath = path.join(cwd, FILE_NAMES.AGENTS);

  // Write AGENTS.md from template
  const agentsWritten = await writeFile(
    agentsPath,
    renderAgentsMdContent(workflowRoot, language),
  );
  if (agentsWritten) {
    console.log(chalk.blue("📄 Created AGENTS.md"));
  }
}
