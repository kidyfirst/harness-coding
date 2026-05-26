#!/usr/bin/env node

/**
 * Harness Spec per-turn breadcrumb hook.
 *
 * Runs on every user prompt. Resolves the active task through the session-aware
 * runtime state and emits a short <workflow-state> block reminding the main AI
 * what task is active and its expected flow.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = ".harness";
const CONTEXT_ENV = "HARNESS_CONTEXT_ID";
const HOOKS_ENV = "HARNESS_HOOKS";
const DISABLE_HOOKS_ENV = "HARNESS_DISABLE_HOOKS";
const SESSIONS_DIR = path.join(WORKFLOW_DIR, ".runtime", "sessions");
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
const CODEX_SUB_AGENT_NOTICE = `<sub-agent-notice>
SUB-AGENT NOTICE - READ FIRST IF SPAWNED VIA spawn_agent

If your parent session spawned you via spawn_agent with an explicit task
message above this hook output, that message is your only job.
- Execute the parent message exactly as written, then return.
- Ignore all Harness Spec workflow guidance below this notice.
- Do NOT call task.js start, task.js add-context, or task.js archive.
- Do NOT call wait_agent or spawn_agent.
- Do NOT modify ${WORKFLOW_DIR}/tasks/* or any other file unless the parent message
  explicitly asks for that.

If you are the main interactive Codex session and the user is typing at the
terminal with no parent agent, use the workflow guidance below normally.
</sub-agent-notice>`;
const CODEX_NO_TASK_BOOTSTRAP_NOTICE = `<harness-bootstrap>
You are running in a Harness Spec-managed Codex session and there is no active task yet.
If you have not already loaded Harness Spec context this session, read the \`harness-start\` skill once:

  $harness-start

(equivalent to reading \`.agents/skills/harness-start/SKILL.md\` and following its Steps 1-3)

The skill walks you through workflow.md, dev profile, git status, active tasks, and spec
indexes. Then route the user's request per the <workflow-state> A/B/C rules below.

Sub-agent exemption: if you are a sub-agent (spawned via spawn_agent with a parent task
message), DO NOT read \`$harness-start\`. Execute the parent message directly as instructed by the
<sub-agent-notice> above.
</harness-bootstrap>`;
const TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[\/workflow-state:\1\]/gs;

function stringValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
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
  if (stringValue(input?.cursor_version)) return "cursor";
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
    const context = readJson(path.join(repoRoot, SESSIONS_DIR, `${contextKeyValue}.json`)) ?? {};
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

  const sessionsRoot = path.join(repoRoot, SESSIONS_DIR);
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

function loadBreadcrumbs(repoRoot) {
  const workflowPath = path.join(repoRoot, WORKFLOW_DIR, "workflow.md");
  if (!fs.existsSync(workflowPath)) return {};
  const content = fs.readFileSync(workflowPath, "utf8");
  const result = {};
  for (const match of content.matchAll(TAG_RE)) {
    const body = match[2].trim();
    if (body) result[match[1]] = body;
  }
  return result;
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

function readConfig(repoRoot) {
  const configPath = path.join(repoRoot, WORKFLOW_DIR, "config.yaml");
  if (!fs.existsSync(configPath)) return {};
  try {
    return parseSimpleYaml(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function codexModeBanner(config) {
  const mode =
    config?.codex?.dispatch_mode === "sub-agent" ? "sub-agent" : "inline";
  return `<codex-mode>${mode}</codex-mode>`;
}

export function resolve_breadcrumb_key(status, platform, config) {
  if (platform !== "codex") return status;
  return config?.codex?.dispatch_mode === "sub-agent" ? status : `${status}-inline`;
}

function buildBreadcrumb(taskId, status, templates, source, breadcrumbKey) {
  const key = breadcrumbKey || status;
  const body = templates[key] ?? templates[status] ?? "Refer to workflow.md for current step.";
  const header = taskId ? `Task: ${taskId} (${status})` : `Status: ${status}`;
  const sourceLine = source ? `\nSource: ${source}` : "";
  return `<workflow-state>\n${header}${sourceLine}\n${body}\n</workflow-state>`;
}

function main() {
  if (
    process.env[HOOKS_ENV] === "0" ||
    process.env[DISABLE_HOOKS_ENV] === "1"
  ) {
    return;
  }

  const raw = fs.readFileSync(0, "utf8");
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  const cwd = stringValue(input.cwd) || process.cwd();
  const repoRoot = findWorkflowRoot(cwd);
  if (!repoRoot) return;

  const platform = detectPlatform(input);
  const config = readConfig(repoRoot);
  const templates = loadBreadcrumbs(repoRoot);
  const active = resolveActiveTask(repoRoot, input, platform);

  let breadcrumb;
  if (!active.taskPath) {
    const key = resolve_breadcrumb_key("no_task", platform, config);
    breadcrumb = buildBreadcrumb(null, "no_task", templates, null, key);
  } else {
    const taskDir = resolveTaskRef(repoRoot, active.taskPath);
    if (!taskDir || !fs.existsSync(taskDir)) return;
    const taskJson = readJson(path.join(taskDir, "task.json"));
    const status = stringValue(taskJson?.status);
    if (!status) return;
    const taskId = stringValue(taskJson?.id) || path.basename(taskDir);
    const key = resolve_breadcrumb_key(status, platform, config);
    breadcrumb = buildBreadcrumb(taskId, status, templates, active.source, key);
  }

  if (platform === "codex") {
    const parts = [CODEX_SUB_AGENT_NOTICE];
    if (!active.taskPath) parts.push(CODEX_NO_TASK_BOOTSTRAP_NOTICE);
    parts.push(codexModeBanner(config));
    parts.push(breadcrumb);
    breadcrumb = parts.join("\n\n");
  }

  const hookEventName = platform === "gemini" ? "BeforeAgent" : "UserPromptSubmit";
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: breadcrumb,
      },
    })}\n`,
  );
}

main();
