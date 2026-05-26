#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function readArg(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

const title = readArg("--title") || "Session";
const summary = readArg("--summary") || "";
const commit = readArg("--commit") || "";
const scriptPath = process.argv[1];
const workflowRoot = scriptPath
  ? path.dirname(path.dirname(scriptPath))
  : ".harness";
const cwd = process.cwd();

const projectOwnerFile = path.join(cwd, workflowRoot, ".project-owner");
let projectOwner = "unknown";
if (fs.existsSync(projectOwnerFile)) {
  const nameLine = fs.readFileSync(projectOwnerFile, "utf-8")
    .split("\n")
    .find((line) => line.startsWith("name="));
  if (nameLine) {
    projectOwner = nameLine.slice(5).trim() || projectOwner;
  }
}

const workspaceDir = path.join(cwd, workflowRoot, "workspace", projectOwner);
fs.mkdirSync(workspaceDir, { recursive: true });
const existing = fs.readdirSync(workspaceDir)
  .filter((entry) => /^journal-\d+\.md$/.test(entry))
  .length;
const journalPath = path.join(workspaceDir, `journal-${existing + 1}.md`);

const content = [
  `# ${title}`,
  "",
  summary && `Summary: ${summary}`,
  commit && `Commit: ${commit}`,
  `Recorded at: ${new Date().toISOString()}`,
].filter(Boolean).join("\n");

fs.writeFileSync(journalPath, content + "\n", "utf-8");
