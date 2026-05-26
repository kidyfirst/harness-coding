#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const scriptPath = process.argv[1];
const workflowRoot = scriptPath
  ? path.dirname(path.dirname(scriptPath))
  : ".harness";
const cwd = process.cwd();

function readCurrentTask() {
  const file = path.join(cwd, workflowRoot, ".current-task");
  if (!fs.existsSync(file)) {
    return "No active task.\n";
  }
  const name = fs.readFileSync(file, "utf-8").trim();
  if (!name) {
    return "No active task.\n";
  }
  return `Current task: ${workflowRoot}/tasks/${name}\nSource: current-task\n`;
}

function listPackages() {
  process.stdout.write(`Workflow root: ${workflowRoot}\n`);
  process.stdout.write(`Spec root: ${workflowRoot}/spec\n`);
}

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined;

switch (mode) {
  case "packages":
    listPackages();
    break;
  case "phase":
    process.stdout.write("See workflow.md for the active phase details.\n");
    break;
  case "record":
    process.stdout.write("Record session context is available from workflow artifacts.\n");
    break;
  default:
    process.stdout.write(readCurrentTask());
}
