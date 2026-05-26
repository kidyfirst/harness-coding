#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const workflowRoot = process.argv[1]
  ? path.dirname(path.dirname(process.argv[1]))
  : ".harness";
const tasksDir = path.join(cwd, workflowRoot, "tasks");
const currentTaskFile = path.join(cwd, workflowRoot, ".current-task");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "task";
}

function listTaskDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort();
}

function taskDir(name) {
  return path.join(tasksDir, name);
}

function createTask(title, slugArg) {
  ensureDir(tasksDir);
  const slug = slugArg || slugify(title);
  const today = new Date();
  const prefix = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const name = `${prefix}-${slug}`;
  const dir = taskDir(name);
  ensureDir(dir);
  writeJson(path.join(dir, "task.json"), {
    id: name,
    name,
    title,
    status: "planning",
    createdAt: today.toISOString(),
    relatedFiles: [],
    subtasks: [],
    children: [],
    meta: {},
  });
  fs.writeFileSync(path.join(dir, "prd.md"), `# ${title}\n`, "utf-8");
  fs.writeFileSync(
    path.join(dir, "implement.jsonl"),
    '{"_example":"Add spec and research files here"}\n',
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "check.jsonl"),
    '{"_example":"Add quality/spec files here"}\n',
    "utf-8",
  );
  fs.writeFileSync(currentTaskFile, `${name}\n`, "utf-8");
  process.stdout.write(`${workflowRoot}/tasks/${name}\n`);
}

function startTask(name) {
  const dir = taskDir(name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Task not found: ${name}`);
  }
  const file = path.join(dir, "task.json");
  const json = readJson(file);
  json.status = "in_progress";
  writeJson(file, json);
  fs.writeFileSync(currentTaskFile, `${name}\n`, "utf-8");
}

function finishTask() {
  if (fs.existsSync(currentTaskFile)) {
    fs.rmSync(currentTaskFile, { force: true });
  }
}

function archiveTask(name) {
  const dir = taskDir(name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Task not found: ${name}`);
  }
  const now = new Date();
  const archiveDir = path.join(
    tasksDir,
    "archive",
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  ensureDir(archiveDir);
  const destination = path.join(archiveDir, name);
  fs.renameSync(dir, destination);
  if (fs.existsSync(currentTaskFile)) {
    const current = fs.readFileSync(currentTaskFile, "utf-8").trim();
    if (current === name) {
      fs.rmSync(currentTaskFile, { force: true });
    }
  }
}

function currentTask() {
  if (!fs.existsSync(currentTaskFile)) return;
  const current = fs.readFileSync(currentTaskFile, "utf-8").trim();
  if (!current) return;
  process.stdout.write(`Current task: ${workflowRoot}/tasks/${current}\n`);
  process.stdout.write("Source: current-task\n");
}

function listTasks() {
  for (const name of listTaskDirs(tasksDir)) {
    process.stdout.write(`${name}\n`);
  }
}

function usage() {
  process.stdout.write(
    "Usage: node ./task.js <create|start|finish|archive|current|list> [...args]\n",
  );
}

try {
  const [, , command, ...args] = process.argv;
  switch (command) {
    case "create": {
      const title = args[0];
      const slugIndex = args.indexOf("--slug");
      const slugArg = slugIndex >= 0 ? args[slugIndex + 1] : undefined;
      if (!title) throw new Error("Task title is required.");
      createTask(title, slugArg);
      break;
    }
    case "start":
      if (!args[0]) throw new Error("Task name is required.");
      startTask(args[0]);
      break;
    case "finish":
      finishTask();
      break;
    case "archive":
      if (!args[0]) throw new Error("Task name is required.");
      archiveTask(args[0]);
      break;
    case "current":
      currentTask();
      break;
    case "list":
      listTasks();
      break;
    default:
      usage();
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
