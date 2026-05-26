#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIRST_REPLY_NOTICE = `<first-reply-notice>
On the first visible assistant reply in this session, begin with exactly one short Chinese sentence:
Harness Spec SessionStart 已注入：workflow、当前任务状态、项目归属信息、git 状态、active tasks、spec 索引已加载。
Then continue directly with the user's request. This notice is one-shot: do not repeat it after the first assistant reply in the same session.
</first-reply-notice>`;
const WORKFLOW_DIR = "WORKFLOW_ROOT";
const CONTEXT_ENV = "HARNESS_CONTEXT_ID";
const HOOKS_ENV = "HARNESS_HOOKS";
const DISABLE_HOOKS_ENV = "HARNESS_DISABLE_HOOKS";

const SUB_AGENT_NOTICE = `<sub-agent-notice>
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

const BREADCRUMB_TAG_RE =
  /\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n.*?\n\s*\[\/workflow-state:\1\]/gs;

function shouldSkipInjection() {
  if (process.env[HOOKS_ENV] === "0") {
    return true;
  }
  if (process.env[DISABLE_HOOKS_ENV] === "1") {
    return true;
  }
  return process.env.CODEX_NON_INTERACTIVE === "1";
}

function normalizeWindowsShellPath(pathStr) {
  if (typeof pathStr !== "string" || !pathStr) {
    return pathStr;
  }

  if (process.platform !== "win32") {
    return pathStr;
  }

  const trimmed = pathStr.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }

  let match = trimmed.match(/^\/([A-Za-z])\/(.*)/);
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  }

  match = trimmed.match(/^\/cygdrive\/([A-Za-z])\/(.*)/);
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  }

  match = trimmed.match(/^\/mnt\/([A-Za-z])\/(.*)/);
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  }

  return pathStr;
}

function readUtf8(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return fallback;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function normalizeTaskRef(taskRef) {
  const trimmed = typeof taskRef === "string" ? taskRef.trim() : "";
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  if (normalized.startsWith("tasks/")) {
    return `${WORKFLOW_DIR}/${normalized}`;
  }
  return normalized;
}

function resolveTaskDir(workflowDir, taskRef) {
  const normalized = normalizeTaskRef(taskRef);
  if (!normalized) {
    return path.join(workflowDir, "tasks");
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  if (normalized.startsWith(`${WORKFLOW_DIR}/`)) {
    return path.join(path.dirname(workflowDir), normalized);
  }
  return path.join(workflowDir, "tasks", normalized);
}

function parseHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveProjectDir(hookInput) {
  const rawCwd =
    typeof hookInput.cwd === "string" && hookInput.cwd ? hookInput.cwd : ".";
  return path.resolve(normalizeWindowsShellPath(rawCwd));
}

function resolveContextKey(hookInput) {
  if (typeof process.env[CONTEXT_ENV] === "string") {
    const envKey = (process.env[CONTEXT_ENV] || "").trim();
    if (envKey) {
      return envKey;
    }
  }

  const explicitFields = [
    hookInput.context_key,
    hookInput.contextKey,
    hookInput.session_id,
    hookInput.sessionId,
    hookInput.thread_id,
    hookInput.threadId,
  ];

  for (const value of explicitFields) {
    if (typeof value === "string" && value.trim()) {
      return `codex_${value.trim()}`;
    }
  }

  const envFields = [
    process.env.CODEX_SESSION_ID,
    process.env.CODEX_THREAD_ID,
    process.env.COPILOT_SESSION_ID,
    process.env.COPILOT_SESSIONID,
  ];
  for (const value of envFields) {
    if (typeof value === "string" && value.trim()) {
      return `codex_${value.trim()}`;
    }
  }

  return null;
}

function resolveActiveTask(workflowDir, hookInput) {
  const contextKey = resolveContextKey(hookInput);
  if (contextKey) {
    const sessionPath = path.join(
      workflowDir,
      ".runtime",
      "sessions",
      `${contextKey}.json`,
    );
    const sessionData = readJson(sessionPath);
    const currentTask =
      sessionData && typeof sessionData.current_task === "string"
        ? sessionData.current_task
        : "";
    if (currentTask) {
      return { taskPath: currentTask, source: `session:${contextKey}`, stale: false };
    }
  }
  const sessionsRoot = path.join(workflowDir, ".runtime", "sessions");
  if (fs.existsSync(sessionsRoot) && fs.statSync(sessionsRoot).isDirectory()) {
    const sessionFiles = fs
      .readdirSync(sessionsRoot)
      .filter((name) => name.endsWith(".json"));
    if (sessionFiles.length === 1) {
      const context = readJson(path.join(sessionsRoot, sessionFiles[0])) ?? {};
      const taskRef =
        context && typeof context.current_task === "string"
          ? context.current_task
          : "";
      if (taskRef) {
        return {
          taskPath: taskRef,
          source: `session-fallback:${path.basename(sessionFiles[0], ".json")}`,
          stale: false,
        };
      }
    }
  }

  return { taskPath: "", source: "none", stale: false };
}

function hasCuratedJsonlEntry(jsonlPath) {
  try {
    const lines = fs.readFileSync(jsonlPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const row = JSON.parse(trimmed);
        if (row && typeof row === "object" && typeof row.file === "string" && row.file) {
          return true;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function getTaskStatus(workflowDir, hookInput) {
  const active = resolveActiveTask(workflowDir, hookInput);
  if (!active.taskPath) {
    return `Status: NO ACTIVE TASK\nSource: ${active.source}\nNext: Describe what you want to work on`;
  }

  const taskRef = active.taskPath;
  const taskDir = resolveTaskDir(workflowDir, taskRef);
  if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) {
    return `Status: STALE POINTER\nTask: ${taskRef}\nSource: ${active.source}\nNext: Task directory not found. Run: node ./${WORKFLOW_DIR}/scripts/task.js finish`;
  }

  const taskData = readJson(path.join(taskDir, "task.json")) ?? {};
  const taskTitle =
    typeof taskData.title === "string" && taskData.title ? taskData.title : taskRef;
  const taskState =
    typeof taskData.status === "string" && taskData.status ? taskData.status : "unknown";

  if (taskState === "completed") {
    return `Status: COMPLETED\nTask: ${taskTitle}\nSource: ${active.source}\nNext: Archive with \`node ./${WORKFLOW_DIR}/scripts/task.js archive ${path.basename(taskDir)}\` or start a new task`;
  }

  const hasPrd = fs.existsSync(path.join(taskDir, "prd.md"));
  const hasContext = ["implement.jsonl", "check.jsonl", "spec.jsonl"].some((name) =>
    hasCuratedJsonlEntry(path.join(taskDir, name)),
  );

  if (!hasPrd) {
    return `Status: NOT READY\nTask: ${taskTitle}\nSource: ${active.source}\nMissing: prd.md not created\nNext: Write PRD (see workflow.md Phase 1.1) then curate implement.jsonl per Phase 1.3`;
  }

  if (!hasContext) {
    return `Status: NOT READY\nTask: ${taskTitle}\nSource: ${active.source}\nMissing: implement.jsonl / check.jsonl missing or empty\nNext: Curate entries per workflow.md Phase 1.3 (spec + research files only), then \`task.js start\``;
  }

  return [
    `Status: READY`,
    `Task: ${taskTitle}`,
    `Source: ${active.source}`,
    "Next required action: dispatch `harness-implement` per Phase 2.1. For agent-capable platforms, the default is to NOT edit code in the main session. After implementation, dispatch `harness-check` per Phase 2.2 before reporting completion.",
    "Sub-agent self-exemption: if you are reading this as a `harness-implement` or `harness-check` sub-agent (your own role / agent name reflects that), this dispatch instruction does NOT apply to you — you are already the dispatched sub-agent. Implement / check directly without spawning another sub-agent of the same kind.",
    "User override (per-turn escape hatch): if the user's CURRENT message explicitly tells the main session to handle it directly (\"你直接改\" / \"别派 sub-agent\" / \"main session 写就行\" / \"do it inline\" / \"不用 sub-agent\"), honor it for this turn and edit code directly. Per-turn only; do NOT invent an override the user did not say.",
  ].join("\n");
}

function extractRange(content, startHeader, endHeader) {
  const lines = content.split(/\r?\n/);
  let start = null;
  let end = lines.length;
  const startMatch = `## ${startHeader}`;
  const endMatch = `## ${endHeader}`;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (start === null && line === startMatch) {
      start = index;
      continue;
    }
    if (start !== null && line === endMatch) {
      end = index;
      break;
    }
  }

  if (start === null) {
    return "";
  }
  return lines.slice(start, end).join("\n").replace(/\s+$/, "");
}

function stripBreadcrumbTagBlocks(content) {
  return content.replace(BREADCRUMB_TAG_RE, "");
}

function buildWorkflowToc(workflowPath) {
  const content = readUtf8(workflowPath);
  if (!content) {
    return "No workflow.md found";
  }

  const lines = [
    "# Development Workflow — Section Index",
    `Full guide: ${WORKFLOW_DIR}/workflow.md  (read on demand)`,
    "",
    "## Table of Contents",
  ];

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      lines.push(line);
    }
  }

  lines.push("", "---", "");

  const phaseIndex = extractRange(
    content,
    "Phase Index",
    "Customizing Harness Spec (for forks)",
  );
  if (phaseIndex) {
    lines.push(stripBreadcrumbTagBlocks(phaseIndex).replace(/\s+$/, ""));
  }

  return lines.join("\n").replace(/\s+$/, "");
}

function buildCurrentState(workflowDir, hookInput) {
  const active = resolveActiveTask(workflowDir, hookInput);
  if (!active.taskPath) {
    return "No active task.\n";
  }
  return `Current task: ${normalizeTaskRef(active.taskPath)}\nSource: ${active.source}\n`;
}

function buildGuidelines(workflowDir) {
  const sections = [];
  sections.push("<guidelines>");
  sections.push(
    "Project spec indexes are listed by path below. Each index contains a **Pre-Development Checklist** listing the specific guideline files to read before coding.\n",
  );
  sections.push(
    "- If you're spawning an implement/check sub-agent, context is injected automatically via `{task}/implement.jsonl` / `check.jsonl`. You do NOT need to read these indexes yourself.",
  );
  sections.push(
    "- For agent-capable platforms, the default is to dispatch `harness-implement` and `harness-check` (so JSONL context is loaded by the sub-agents) rather than editing code in the main session. Honor a per-turn user override only if the user's current message explicitly opts out (see <task-status> below for override phrases).",
  );
  sections.push(
    '- Sub-agent self-exemption: if you are reading this as a `harness-implement` or `harness-check` sub-agent, the "dispatch harness-implement / harness-check" rule above does NOT apply to you — you are already the dispatched sub-agent. Do NOT spawn another sub-agent of the same kind; implement / check directly.\n',
  );

  const guidesIndex = path.join(workflowDir, "spec", "guides", "index.md");
  if (fs.existsSync(guidesIndex)) {
    sections.push("## guides (inlined — cross-package thinking guides)");
    sections.push(readUtf8(guidesIndex).replace(/\s+$/, ""));
    sections.push("");
  }

  const specDir = path.join(workflowDir, "spec");
  const indexPaths = [];
  if (fs.existsSync(specDir) && fs.statSync(specDir).isDirectory()) {
    for (const entry of fs.readdirSync(specDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "guides") {
        continue;
      }
      const directIndex = path.join(specDir, entry.name, "index.md");
      if (fs.existsSync(directIndex)) {
        indexPaths.push(`${WORKFLOW_DIR}/spec/${entry.name}/index.md`);
        continue;
      }
      const nestedRoot = path.join(specDir, entry.name);
      for (const nested of fs.readdirSync(nestedRoot, { withFileTypes: true })) {
        if (!nested.isDirectory()) {
          continue;
        }
        const nestedIndex = path.join(nestedRoot, nested.name, "index.md");
        if (fs.existsSync(nestedIndex)) {
          indexPaths.push(`${WORKFLOW_DIR}/spec/${entry.name}/${nested.name}/index.md`);
        }
      }
    }
  }

  if (indexPaths.length > 0) {
    sections.push("## Available spec indexes (read on demand)");
    for (const indexPath of indexPaths.sort()) {
      sections.push(`- ${indexPath}`);
    }
    sections.push("");
  }

  sections.push(
    `Discover more via: \`node ./${WORKFLOW_DIR}/scripts/get_context.js --mode packages\``,
  );
  sections.push("</guidelines>");
  return sections.join("\n");
}

function buildAdditionalContext(projectDir, hookInput) {
  const workflowDir = path.join(projectDir, WORKFLOW_DIR);
  const sections = [];
  sections.push(SUB_AGENT_NOTICE);
  sections.push("");
  sections.push("<session-context>");
  sections.push("You are starting a new session in a Harness Spec-managed project.");
  sections.push("Read and follow all instructions below carefully.");
  sections.push("</session-context>");
  sections.push("");
  sections.push(FIRST_REPLY_NOTICE);
  sections.push("");
  sections.push("<current-state>");
  sections.push(buildCurrentState(workflowDir, hookInput).replace(/\s+$/, ""));
  sections.push("</current-state>");
  sections.push("");
  sections.push("<workflow>");
  sections.push(buildWorkflowToc(path.join(workflowDir, "workflow.md")));
  sections.push("</workflow>");
  sections.push("");
  sections.push(buildGuidelines(workflowDir));
  sections.push("");
  sections.push("<task-status>");
  sections.push(getTaskStatus(workflowDir, hookInput));
  sections.push("</task-status>");
  sections.push("");
  sections.push("<ready>");
  sections.push(
    "Context loaded. Workflow index, project state, and guidelines are already injected above — do NOT re-read them.",
  );
  sections.push(
    "When the user sends the first message, follow <task-status> and the workflow guide.",
  );
  sections.push(
    "If a task is READY, execute its Next required action without asking whether to continue.",
  );
  sections.push("</ready>");
  sections.push("");
  return sections.join("\n");
}

function main() {
  if (shouldSkipInjection()) {
    process.exit(0);
  }

  const hookInput = parseHookInput();
  const projectDir = resolveProjectDir(hookInput);
  const additionalContext = buildAdditionalContext(projectDir, hookInput);
  const result = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main();
