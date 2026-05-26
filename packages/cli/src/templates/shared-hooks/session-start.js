#!/usr/bin/env node

/**
 * Session Start Hook - inject structured Harness Spec context.
 */

import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = "WORKFLOW_ROOT";
const WORKFLOW_CUSTOMIZATION_SECTION = "Customizing Harness Spec (for forks)";
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
const FIRST_REPLY_NOTICE = `<first-reply-notice>
On the first visible assistant reply in this session, begin with exactly one short Chinese sentence:
Harness Spec SessionStart 已注入：workflow、当前任务状态、项目归属信息、git 状态、active tasks、spec 索引已加载。
Then continue directly with the user's request. This notice is one-shot: do not repeat it after the first assistant reply in the same session.
</first-reply-notice>`;
const BREADCRUMB_TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n.*?\n\s*\[\/workflow-state:\1\]/gs;

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

function normalizeWindowsShellPath(value) {
  if (process.platform !== "win32" || !value) return value;
  if (/^[A-Za-z]:[\\/]/.test(value)) return value;
  let match = value.match(/^\/([A-Za-z])\/(.*)$/);
  if (match) return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  match = value.match(/^\/cygdrive\/([A-Za-z])\/(.*)$/);
  if (match) return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  match = value.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (match) return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  return value;
}

function detectPlatform(input) {
  if (process.env.CLAUDE_PROJECT_DIR) return "claude";
  if (process.env.GEMINI_PROJECT_DIR) return "gemini";
  const parts = new Set((process.argv[1] || "").split(path.sep));
  if (parts.has(".claude")) return "claude";
  if (parts.has(".codex")) return "codex";
  if (parts.has(".gemini")) return "gemini";
  return stringValue(input.platform || input.source);
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
    if (taskRef) {
      const resolved = resolveTaskRef(repoRoot, taskRef);
      return {
        taskPath: taskRef,
        source: `session:${contextKeyValue}`,
        stale: !resolved || !fs.existsSync(resolved),
      };
    }
  }
  const sessionsRoot = path.join(repoRoot, WORKFLOW_DIR, ".runtime", "sessions");
  if (fs.existsSync(sessionsRoot)) {
    const sessionFiles = fs.readdirSync(sessionsRoot).filter((name) => name.endsWith(".json"));
    if (sessionFiles.length === 1) {
      const filename = sessionFiles[0];
      const context = readJson(path.join(sessionsRoot, filename)) ?? {};
      const taskRef = stringValue(context.current_task);
      if (taskRef) {
        const resolved = resolveTaskRef(repoRoot, taskRef);
        return {
          taskPath: taskRef,
          source: `session-fallback:${path.basename(filename, ".json")}`,
          stale: !resolved || !fs.existsSync(resolved),
        };
      }
    }
  }
  return { taskPath: null, source: "none", stale: false };
}

function hasCuratedJsonlEntry(jsonlPath) {
  try {
    return fs
      .readFileSync(jsonlPath, "utf8")
      .split(/\r?\n/)
      .some((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        try {
          const row = JSON.parse(trimmed);
          return !!row?.file;
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

function shouldSkipInjection() {
  if (process.env[HOOKS_ENV] === "0") return true;
  if (process.env[DISABLE_HOOKS_ENV] === "1") return true;
  return ["CLAUDE_NON_INTERACTIVE", "GEMINI_NON_INTERACTIVE", "CODEX_NON_INTERACTIVE"].some(
    (name) => process.env[name] === "1",
  );
}

function persistContextKeyForBash(contextKeyValue) {
  if (!contextKeyValue || !process.env.CLAUDE_ENV_FILE) return;
  try {
    fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export ${CONTEXT_ENV}=${JSON.stringify(contextKeyValue)}\n`, "utf8");
  } catch {
    // ignore
  }
}

function runScript(scriptPath, repoRoot, contextKeyValue) {
  if (!fs.existsSync(scriptPath)) return "No context available";
  const result = childProcess.spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      ...(contextKeyValue ? { [CONTEXT_ENV]: contextKeyValue } : {}),
    },
  });
  return result.status === 0 ? result.stdout || "No context available" : "No context available";
}

function parseSimpleYaml(content) {
  const lines = content.split(/\r?\n/);
  function stripInlineComment(value) {
    let inQuote = null;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch;
        continue;
      }
      if (ch === "#" && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i);
    }
    return value;
  }
  function unquote(value) {
    return value.length >= 2 && value[0] === value[value.length - 1] && `"'`.includes(value[0])
      ? value.slice(1, -1)
      : value;
  }
  function nextContentLine(start) {
    for (let i = start; i < lines.length; i += 1) {
      const stripped = lines[i].trim();
      if (stripped && !stripped.startsWith("#")) return [i, lines[i]];
    }
    return [lines.length, ""];
  }
  function parseBlock(start, minIndent, target) {
    let i = start;
    let currentList = null;
    while (i < lines.length) {
      const line = lines[i];
      const stripped = line.trim();
      if (!stripped || stripped.startsWith("#")) {
        i += 1;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent < minIndent) break;
      if (stripped.startsWith("- ")) {
        if (currentList) currentList.push(unquote(stripped.slice(2).trim()));
        i += 1;
        continue;
      }
      const colon = stripped.indexOf(":");
      if (colon < 0) {
        i += 1;
        continue;
      }
      const key = stripped.slice(0, colon).trim();
      const value = unquote(stripInlineComment(stripped.slice(colon + 1)).trim());
      currentList = null;
      if (value) {
        target[key] = value;
        i += 1;
        continue;
      }
      const [nextIndex, nextLine] = nextContentLine(i + 1);
      if (nextIndex >= lines.length) {
        target[key] = {};
        i = nextIndex;
        continue;
      }
      if (nextLine.trim().startsWith("- ")) {
        currentList = [];
        target[key] = currentList;
        i += 1;
        continue;
      }
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      if (nextIndent > indent) {
        const nested = {};
        target[key] = nested;
        i = parseBlock(i + 1, nextIndent, nested);
        continue;
      }
      target[key] = {};
      i += 1;
    }
    return i;
  }
  const result = {};
  parseBlock(0, 0, result);
  return result;
}

function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, WORKFLOW_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) return {};
  try {
    return parseSimpleYaml(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveSpecScope(config, taskPackage) {
  const packages = asDict(config.packages) ?? {};
  const packageNames = Object.keys(packages);
  if (!packageNames.length) return null;
  const scope = config.spec_scope;
  const defaultPackage = stringValue(config.default_package);
  if (scope === "active_task") {
    if (taskPackage && packages[taskPackage]) return new Set([taskPackage]);
    if (defaultPackage && packages[defaultPackage]) return new Set([defaultPackage]);
    return null;
  }
  if (Array.isArray(scope)) {
    const valid = scope.filter((entry) => typeof entry === "string" && packages[entry]);
    return valid.length ? new Set(valid) : null;
  }
  return null;
}

function readFile(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function extractRange(content, startHeader, endHeader) {
  const lines = content.split(/\r?\n/);
  const startMatch = `## ${startHeader}`;
  const endMatch = `## ${endHeader}`;
  let start = -1;
  let end = lines.length;
  lines.forEach((line, index) => {
    const stripped = line.trim();
    if (start < 0 && stripped === startMatch) start = index;
    else if (start >= 0 && stripped === endMatch && end === lines.length) end = index;
  });
  if (start < 0) return "";
  return lines.slice(start, end).join("\n").trimEnd();
}

function buildWorkflowOverview(workflowPath) {
  const content = readFile(workflowPath);
  if (!content) return "No workflow.md found";
  const out = [
    "# Development Workflow - Section Index",
    `Full guide: ${WORKFLOW_DIR}/workflow.md  (read on demand)`,
    "",
    "## Table of Contents",
  ];
  content.split(/\r?\n/).forEach((line) => {
    if (line.startsWith("## ")) out.push(line);
  });
  out.push("", "---", "");
  const phases = extractRange(
    content,
    "Phase Index",
    WORKFLOW_CUSTOMIZATION_SECTION,
  );
  if (phases) out.push(phases.replace(BREADCRUMB_TAG_RE, "").trimEnd());
  return out.join("\n").trimEnd();
}

function getTaskStatus(repoRoot, input, platform) {
  const active = resolveActiveTask(repoRoot, input, platform);
  if (!active.taskPath) {
    return (
      "Status: NO ACTIVE TASK\n" +
      `Source: ${active.source}\n` +
      "Next-Action: After the user describes their intent, load skill `harness-brainstorm` " +
      `to clarify requirements and create a task via \`node ./${WORKFLOW_DIR}/scripts/task.js create\`.\n` +
      "Research reminder: for research-heavy tasks (comparing tools, reading external docs, " +
      "cross-platform surveys), spawn `harness-research` sub-agents via the Task tool.\n" +
      "User override (per-turn escape hatch): if the user's first message explicitly opts " +
      "out of the workflow, honor it for this turn."
    );
  }

  const taskDir = resolveTaskRef(repoRoot, active.taskPath);
  if (active.stale || !taskDir || !fs.existsSync(taskDir)) {
    return (
      `Status: STALE POINTER\nTask: ${active.taskPath}\n` +
      `Source: ${active.source}\n` +
      `Next-Action: Run \`node ./${WORKFLOW_DIR}/scripts/task.js finish\` to clear the stale pointer, then ask the user what to work on next.`
    );
  }

  const taskJson = readJson(path.join(taskDir, "task.json")) ?? {};
  const taskTitle = stringValue(taskJson.title) || active.taskPath;
  const taskStatus = stringValue(taskJson.status) || "unknown";

  if (taskStatus === "completed") {
    return (
      `Status: COMPLETED\nTask: ${taskTitle}\n` +
      `Source: ${active.source}\n` +
      `Next-Action: Load skill \`harness-update-spec\` to capture learnings, then archive with \`node ./${WORKFLOW_DIR}/scripts/task.js archive\`.`
    );
  }

  if (!fs.existsSync(path.join(taskDir, "prd.md"))) {
    return (
      `Status: PLANNING\nTask: ${taskTitle}\n` +
      `Source: ${active.source}\n` +
      "Next-Action: Load skill `harness-brainstorm` to clarify requirements with the user and produce prd.md in the task directory."
    );
  }

  const implementJsonl = path.join(taskDir, "implement.jsonl");
  if (fs.existsSync(implementJsonl) && !hasCuratedJsonlEntry(implementJsonl)) {
    return (
      `Status: PLANNING (Phase 1.3)\nTask: ${taskTitle}\n` +
      `Source: ${active.source}\n` +
      `Next-Action: Curate \`implement.jsonl\` and \`check.jsonl\` with the spec + research files the Phase 2 sub-agents will need. Run \`node ./${WORKFLOW_DIR}/scripts/get_context.js --mode packages\` to list available specs.`
    );
  }

  return (
    `Status: READY\nTask: ${taskTitle}\n` +
    `Source: ${active.source}\n` +
    "Next required action: dispatch `harness-implement` per Phase 2.1. " +
    "After implementation, dispatch `harness-check` per Phase 2.2 before reporting completion.\n" +
    "Sub-agent roster: `harness-implement` (writes code), `harness-check` (verifies + self-fixes), `harness-research` (persists findings to `research/*.md`).\n" +
    "Sub-agent self-exemption: if you are reading this as a `harness-implement` or `harness-check` sub-agent, this dispatch instruction does NOT apply to you - you are already the dispatched sub-agent. Implement / check directly without spawning another sub-agent of the same kind.\n" +
    "User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the main session to handle it directly, honor it for this turn."
  );
}

function main() {
  if (shouldSkipInjection()) return;

  let hookInput = {};
  try {
    hookInput = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    hookInput = {};
  }

  const projectDirEnv = process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR;
  const projectDir = projectDirEnv
    ? path.resolve(normalizeWindowsShellPath(projectDirEnv))
    : path.resolve(normalizeWindowsShellPath(stringValue(hookInput.cwd) || process.cwd()));
  const repoRoot = findWorkflowRoot(projectDir);
  if (!repoRoot) return;

  const platform = detectPlatform(hookInput);
  const contextKeyValue = resolveContextKey(hookInput, platform);
  persistContextKeyForBash(contextKeyValue);
  const config = loadConfig(repoRoot);

  const active = resolveActiveTask(repoRoot, hookInput, platform);
  let taskPackage = "";
  if (active.taskPath) {
    const taskDir = resolveTaskRef(repoRoot, active.taskPath);
    const taskJson = taskDir ? readJson(path.join(taskDir, "task.json")) : null;
    taskPackage = stringValue(taskJson?.package);
  }
  const allowedPackages = resolveSpecScope(config, taskPackage);

  const parts = [];
  parts.push(`<session-context>
You are starting a new session in a Harness Spec-managed project.
Read and follow all instructions below carefully.
</session-context>`);
  parts.push(FIRST_REPLY_NOTICE);
  parts.push(`<current-state>
${runScript(path.join(repoRoot, WORKFLOW_DIR, "scripts", "get_context.js"), repoRoot, contextKeyValue).trim()}
</current-state>`);
  parts.push(`<workflow>
${buildWorkflowOverview(path.join(repoRoot, WORKFLOW_DIR, "workflow.md"))}
</workflow>`);

  const guidelineLines = [
    "<guidelines>",
    "Project spec indexes are listed by path below. Each index contains a **Pre-Development Checklist** listing the specific guideline files to read before coding.",
    "",
    "- If you're spawning an implement/check sub-agent, context is injected or loaded by the sub-agent via `{task}/implement.jsonl` / `check.jsonl`.",
    "- For agent-capable platforms, the default is to dispatch `harness-implement` and `harness-check` rather than editing code in the main session.",
    '- Sub-agent self-exemption: if you are reading this as a `harness-implement` or `harness-check` sub-agent, the "dispatch harness-implement / harness-check" rule above does NOT apply to you - you are already the dispatched sub-agent. Do NOT spawn another sub-agent of the same kind; implement / check directly.',
    "",
  ];
  const guidesIndex = path.join(repoRoot, WORKFLOW_DIR, "spec", "guides", "index.md");
  if (fs.existsSync(guidesIndex)) {
    guidelineLines.push("## guides (inlined - cross-package thinking guides)");
    guidelineLines.push(readFile(guidesIndex));
    guidelineLines.push("");
  }
  const specRoot = path.join(repoRoot, WORKFLOW_DIR, "spec");
  const specPaths = [];
  if (fs.existsSync(specRoot)) {
    for (const sub of fs.readdirSync(specRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!sub.isDirectory() || sub.name.startsWith(".") || sub.name === "guides") continue;
      const subDir = path.join(specRoot, sub.name);
      const directIndex = path.join(subDir, "index.md");
      if (fs.existsSync(directIndex)) {
        specPaths.push(`${WORKFLOW_DIR}/spec/${sub.name}/index.md`);
        continue;
      }
      if (allowedPackages && !allowedPackages.has(sub.name)) continue;
      for (const nested of fs.readdirSync(subDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!nested.isDirectory()) continue;
        const nestedIndex = path.join(subDir, nested.name, "index.md");
        if (fs.existsSync(nestedIndex)) {
          specPaths.push(`${WORKFLOW_DIR}/spec/${sub.name}/${nested.name}/index.md`);
        }
      }
    }
  }
  if (specPaths.length) {
    guidelineLines.push("## Available spec indexes (read on demand)");
    specPaths.forEach((value) => guidelineLines.push(`- ${value}`));
    guidelineLines.push("");
  }
  guidelineLines.push(`Discover more via: \`node ./${WORKFLOW_DIR}/scripts/get_context.js --mode packages\``);
  guidelineLines.push("</guidelines>");
  parts.push(guidelineLines.join("\n"));

  parts.push(`<task-status>
${getTaskStatus(repoRoot, hookInput, platform)}
</task-status>`);
  parts.push(`<ready>
Context loaded. Workflow index, project state, and guidelines are already injected above - do NOT re-read them.
When the user sends the first message, follow <task-status> and the workflow guide.
If a task is READY, execute its Next required action without asking whether to continue.
</ready>`);

  const contextText = parts.join("\n\n");
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: contextText,
      },
      additional_context: contextText,
    })}\n`,
  );
}

main();
