#!/usr/bin/env node

/**
 * Multi-platform sub-agent context injection hook.
 *
 * Supported runtime platforms for this shared hook: Claude Code.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = "WORKFLOW_ROOT";
const CONTEXT_ENV = "HARNESS_CONTEXT_ID";
const HOOKS_ENV = "HARNESS_HOOKS";
const DISABLE_HOOKS_ENV = "HARNESS_DISABLE_HOOKS";
const SESSION_KEYS = ["session_id", "sessionId", "sessionID"];
const CONVERSATION_KEYS = ["conversation_id", "conversationId", "conversationID"];
const TRANSCRIPT_KEYS = ["transcript_path", "transcriptPath", "transcript"];
const NESTED_KEYS = ["input", "properties", "event", "hook_input", "hookInput"];
const ENV_SESSION_KEYS = {
  claude: ["CLAUDE_SESSION_ID", "CLAUDE_CODE_SESSION_ID"],
  codex: ["CODEX_SESSION_ID", "CODEX_THREAD_ID"],
  gemini: ["GEMINI_SESSION_ID"],
};
const ENV_TRANSCRIPT_KEYS = {
  claude: ["CLAUDE_TRANSCRIPT_PATH"],
  codex: ["CODEX_TRANSCRIPT_PATH"],
  gemini: ["GEMINI_TRANSCRIPT_PATH"],
};
const AGENT_IMPLEMENT = "harness-implement";
const AGENT_CHECK = "harness-check";
const AGENT_RESEARCH = "harness-research";
const AGENTS_REQUIRE_TASK = new Set([AGENT_IMPLEMENT, AGENT_CHECK]);
const AGENTS_ALL = new Set([AGENT_IMPLEMENT, AGENT_CHECK, AGENT_RESEARCH]);

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asDict(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function lookupString(data, keys) {
  for (const key of keys) {
    const value = stringValue(data[key]);
    if (value) return value;
  }
  for (const nestedKey of NESTED_KEYS) {
    const nested = asDict(data[nestedKey]);
    if (!nested) continue;
    const value = lookupString(nested, keys);
    if (value) return value;
  }
  return null;
}

function sanitizeKey(raw) {
  return raw.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 160);
}

function hashValue(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 24);
}

function contextKey(platform, kind, value) {
  if (kind === "transcript") return `${platform}_transcript_${hashValue(value)}`;
  const safe = sanitizeKey(value);
  return safe ? `${platform}_${safe}` : `${platform}_${hashValue(value)}`;
}

function detectPlatform(input) {
  if (process.env.CLAUDE_PROJECT_DIR) return "claude";
  if (process.env.GEMINI_PROJECT_DIR) return "gemini";
  const parts = new Set((process.argv[1] || "").split(path.sep));
  if (parts.has(".claude")) return "claude";
  if (parts.has(".codex")) return "codex";
  if (parts.has(".gemini")) return "gemini";
  return null;
}

function resolveContextKey(input, platform) {
  const explicit = stringValue(process.env[CONTEXT_ENV]);
  if (explicit) return sanitizeKey(explicit) || hashValue(explicit);

  const data = asDict(input) ?? {};
  const sessionId = lookupString(data, SESSION_KEYS);
  if (sessionId) return contextKey(platform || "session", "session", sessionId);
  const conversationId = lookupString(data, CONVERSATION_KEYS);
  if (conversationId) {
    return contextKey(platform || "session", "conversation", conversationId);
  }
  const transcript = lookupString(data, TRANSCRIPT_KEYS);
  if (transcript) return contextKey(platform || "session", "transcript", transcript);

  if (platform && ENV_SESSION_KEYS[platform]) {
    for (const envName of ENV_SESSION_KEYS[platform]) {
      const value = stringValue(process.env[envName]);
      if (value) return contextKey(platform, "session", value);
    }
  }
  if (platform && ENV_TRANSCRIPT_KEYS[platform]) {
    for (const envName of ENV_TRANSCRIPT_KEYS[platform]) {
      const value = stringValue(process.env[envName]);
      if (value) return contextKey(platform, "transcript", value);
    }
  }
  return null;
}

function findWorkflowRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, WORKFLOW_DIR))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeTaskRef(taskRef) {
  const trimmed = taskRef.trim();
  if (!trimmed) return "";
  if (path.isAbsolute(trimmed)) return trimmed;
  let normalized = trimmed.replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith("tasks/")) return `${WORKFLOW_DIR}/${normalized}`;
  return normalized;
}

function resolveTaskRef(repoRoot, taskRef) {
  const normalized = normalizeTaskRef(taskRef);
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return normalized;
  if (normalized.startsWith(`${WORKFLOW_DIR}/`)) return path.join(repoRoot, normalized);
  return path.join(repoRoot, WORKFLOW_DIR, "tasks", normalized);
}

function resolveActiveTask(repoRoot, input, platform) {
  const contextKeyValue = resolveContextKey(input, platform);
  if (contextKeyValue) {
    const context =
      readJson(path.join(repoRoot, WORKFLOW_DIR, ".runtime", "sessions", `${contextKeyValue}.json`)) ?? {};
    const taskRef = stringValue(context.current_task);
    if (taskRef) return taskRef;
  }
  const sessionsRoot = path.join(repoRoot, WORKFLOW_DIR, ".runtime", "sessions");
  if (!fs.existsSync(sessionsRoot)) return null;
  const sessionFiles = fs.readdirSync(sessionsRoot).filter((name) => name.endsWith(".json"));
  if (sessionFiles.length !== 1) return null;
  const context = readJson(path.join(sessionsRoot, sessionFiles[0])) ?? {};
  return stringValue(context.current_task) || null;
}

function readFileContent(basePath, relativePath) {
  const fullPath = path.join(basePath, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch {
    return null;
  }
}

function readDirectoryContents(basePath, relativeDir, maxFiles = 20) {
  const fullPath = path.join(basePath, relativeDir);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return [];
  const results = [];
  for (const filename of fs.readdirSync(fullPath).sort()) {
    const filePath = path.join(fullPath, filename);
    if (!filename.endsWith(".md") || !fs.statSync(filePath).isFile()) continue;
    try {
      results.push([path.posix.join(relativeDir, filename).replaceAll("\\", "/"), fs.readFileSync(filePath, "utf8")]);
    } catch {
      // ignore unreadable entries
    }
    if (results.length >= maxFiles) break;
  }
  return results;
}

export function read_jsonl_entries(basePath, jsonlPath) {
  const fullPath = path.join(basePath, jsonlPath);
  if (!fs.existsSync(fullPath)) return [];
  const results = [];
  let sawRealEntry = false;
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let item;
    try {
      item = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const filePath = stringValue(item?.file) || stringValue(item?.path);
    if (!filePath) continue;
    sawRealEntry = true;
    if (item?.type === "directory") {
      results.push(...readDirectoryContents(basePath, filePath));
      continue;
    }
    const content = readFileContent(basePath, filePath);
    if (content) results.push([filePath, content]);
  }
  return sawRealEntry ? results : [];
}

function getAgentContext(repoRoot, taskDir, agentType) {
  return read_jsonl_entries(repoRoot, `${taskDir}/${agentType}.jsonl`)
    .map(([filePath, content]) => `=== ${filePath} ===\n${content}`)
    .join("\n\n");
}

function getImplementContext(repoRoot, taskDir) {
  const contextParts = [];
  const baseContext = getAgentContext(repoRoot, taskDir, "implement");
  if (baseContext) contextParts.push(baseContext);
  const prd = readFileContent(repoRoot, `${taskDir}/prd.md`);
  if (prd) contextParts.push(`=== ${taskDir}/prd.md (Requirements) ===\n${prd}`);
  const info = readFileContent(repoRoot, `${taskDir}/info.md`);
  if (info) contextParts.push(`=== ${taskDir}/info.md (Technical Design) ===\n${info}`);
  return contextParts.join("\n\n");
}

function getCheckContext(repoRoot, taskDir) {
  const contextParts = read_jsonl_entries(repoRoot, `${taskDir}/check.jsonl`)
    .map(([filePath, content]) => `=== ${filePath} ===\n${content}`);
  const prd = readFileContent(repoRoot, `${taskDir}/prd.md`);
  if (prd) contextParts.push(`=== ${taskDir}/prd.md (Requirements) ===\n${prd}`);
  return contextParts.join("\n\n");
}

function getFinishContext(repoRoot, taskDir) {
  return getCheckContext(repoRoot, taskDir);
}

function buildImplementPrompt(originalPrompt, context) {
  return `<!-- harness-hook-injected -->
# Implement Agent Task

You are the Implement Agent in the Multi-Agent Pipeline.

## Your Context

All the information you need has been prepared for you:

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Understand specs** - All dev specs are injected above, understand them
2. **Understand requirements** - Read requirements document and technical design
3. **Implement feature** - Implement following specs and design
4. **Self-check** - Ensure code quality against check specs

## Important Constraints

- Do NOT execute git commit, only code modifications
- Follow all dev specs injected above
- Report list of modified/created files when done`;
}

function buildCheckPrompt(originalPrompt, context) {
  return `<!-- harness-hook-injected -->
# Check Agent Task

You are the Check Agent in the Multi-Agent Pipeline (code and cross-layer checker).

## Your Context

All check specs and dev specs you need:

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Get changes** - Run \`git diff --name-only\` and \`git diff\` to get code changes
2. **Check against specs** - Check item by item against specs above
3. **Self-fix** - Fix issues directly, don't just report
4. **Run verification** - Run project's lint and typecheck commands

## Important Constraints

- Fix issues yourself, don't just report
- Must execute complete checklist in check specs
- Pay special attention to impact radius analysis (L1-L5)`;
}

function buildFinishPrompt(originalPrompt, context) {
  return `<!-- harness-hook-injected -->
# Finish Agent Task

You are performing the final check before creating a PR.

## Your Context

Finish checklist and requirements:

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Review changes** - Run \`git diff --name-only\` to see all changed files
2. **Verify requirements** - Check each requirement in prd.md is implemented
3. **Spec sync** - Analyze whether changes introduce new patterns, contracts, or conventions
   - If new pattern/convention found: read target spec file -> update it -> update index.md if needed
   - If infra/cross-layer change: follow the 7-section mandatory template from update-spec.md
   - If pure code fix with no new patterns: skip this step
4. **Run final checks** - Execute lint and typecheck
5. **Confirm ready** - Ensure code is ready for PR

## Important Constraints

- You MAY update spec files when gaps are detected (use update-spec.md as guide)
- MUST read the target spec file BEFORE editing (avoid duplicating existing content)
- Do NOT update specs for trivial changes (typos, formatting, obvious fixes)
- If critical CODE issues found, report them clearly (fix specs, not code)
- Verify all acceptance criteria in prd.md are met`;
}

function getResearchContext(repoRoot) {
  const specRoot = path.join(repoRoot, WORKFLOW_DIR, "spec");
  const treeLines = [`${WORKFLOW_DIR}/spec/`];
  if (fs.existsSync(specRoot)) {
    const packageDirs = fs.readdirSync(specRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    packageDirs.forEach((entry, index) => {
      const isLast = index === packageDirs.length - 1;
      const layers = fs
        .readdirSync(path.join(specRoot, entry.name), { withFileTypes: true })
        .filter((child) => child.isDirectory())
        .map((child) => child.name)
        .sort();
      const layerInfo = layers.length ? ` (${layers.join(", ")})` : "";
      treeLines.push(`${isLast ? "└── " : "├── "}${entry.name}/${layerInfo}`);
    });
  }
  return `## Project Spec Directory Structure

\`\`\`
${treeLines.join("\n")}
\`\`\`

To get structured package info, run: \`node ./${WORKFLOW_DIR}/scripts/get_context.js --mode packages\`

## Search Tips

- Spec files: \`${WORKFLOW_DIR}/spec/**/*.md\`
- Code search: Use Glob and Grep tools
- Tech solutions: Use mcp__exa__web_search_exa or mcp__exa__get_code_context_exa`;
}

function buildResearchPrompt(originalPrompt, context) {
  return `# Research Agent Task

You are the Research Agent in the Multi-Agent Pipeline (search researcher).

## Core Principle

**You do one thing: find and explain information.**

You are a documenter, not a reviewer.

## Project Info

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Understand query** - Determine search type (internal/external) and scope
2. **Plan search** - List search steps for complex queries
3. **Execute search** - Execute multiple independent searches in parallel
4. **Organize results** - Output structured report`;
}

function extractSubagentName(value) {
  const direct = stringValue(value);
  if (direct) return direct;
  if (!asDict(value)) return "";
  for (const key of ["name", "subagent_type_name", "subagentTypeName"]) {
    const candidate = stringValue(value[key]);
    if (candidate) return candidate;
  }
  const customName = stringValue(value.custom?.name);
  if (customName) return customName;
  const oneOf = asDict(value.type);
  if (oneOf?.case === "custom") {
    const nestedName = stringValue(oneOf.value?.name);
    if (nestedName) return nestedName;
  }
  const caseName = stringValue(value.case);
  if (caseName === "custom") {
    const nestedName = stringValue(value.value?.name);
    if (nestedName) return nestedName;
  }
  for (const agentName of AGENTS_ALL) {
    if (value[agentName]) return agentName;
  }
  return caseName;
}

function extractSubagentType(toolInput) {
  for (const key of [
    "subagent_type",
    "subagentType",
    "subagent_type_name",
    "subagentTypeName",
    "agent_type",
    "agentType",
    "name",
  ]) {
    const candidate = extractSubagentName(toolInput[key]);
    if (candidate) return candidate;
  }
  return "";
}

function parseHookInput(input) {
  const toolInput = asDict(input.tool_input) ?? {};
  const toolName = stringValue(input.tool_name || input.toolName).toLowerCase();
  if (["task", "agent", "subagent"].includes(toolName)) {
    return [extractSubagentType(toolInput), stringValue(toolInput.prompt), toolInput];
  }
  return ["", "", toolInput];
}

function main() {
  if (
    process.env[HOOKS_ENV] === "0" ||
    process.env[DISABLE_HOOKS_ENV] === "1"
  ) {
    return;
  }

  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return;
  }

  const [subagentType, originalPrompt, toolInput] = parseHookInput(input);
  if (!AGENTS_ALL.has(subagentType)) return;

  const cwd = stringValue(input.cwd) || process.cwd();
  const repoRoot = findWorkflowRoot(cwd);
  if (!repoRoot) return;

  const taskDir = resolveActiveTask(repoRoot, input, detectPlatform(input));
  if (AGENTS_REQUIRE_TASK.has(subagentType)) {
    if (!taskDir) return;
    const fullTaskDir = resolveTaskRef(repoRoot, taskDir);
    if (!fullTaskDir || !fs.existsSync(fullTaskDir)) return;
  }

  const isFinishPhase = originalPrompt.toLowerCase().includes("[finish]");
  let context = "";
  let newPrompt = "";
  if (subagentType === AGENT_IMPLEMENT) {
    context = getImplementContext(repoRoot, taskDir);
    newPrompt = buildImplementPrompt(originalPrompt, context);
  } else if (subagentType === AGENT_CHECK) {
    context = isFinishPhase ? getFinishContext(repoRoot, taskDir) : getCheckContext(repoRoot, taskDir);
    newPrompt = isFinishPhase
      ? buildFinishPrompt(originalPrompt, context)
      : buildCheckPrompt(originalPrompt, context);
  } else if (subagentType === AGENT_RESEARCH) {
    context = getResearchContext(repoRoot);
    newPrompt = buildResearchPrompt(originalPrompt, context);
  }
  if (!context) return;

  const updated = { ...toolInput, prompt: newPrompt };
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: updated,
      },
      permission: "allow",
      updated_input: updated,
      updatedInput: updated,
    })}\n`,
  );
}

main();
