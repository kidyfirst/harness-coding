#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , name] = process.argv;

if (!name) {
  process.stderr.write("Project owner name is required.
");
  process.exit(1);
}

const scriptPath = process.argv[1];
const workflowRoot = scriptPath
  ? path.dirname(path.dirname(scriptPath))
  : ".harness";
const cwd = process.cwd();
const projectOwnerFile = path.join(cwd, workflowRoot, ".project-owner");
const workspaceDir = path.join(cwd, workflowRoot, "workspace", name);

fs.mkdirSync(workspaceDir, { recursive: true });
fs.writeFileSync(
  projectOwnerFile,
  `name=${name}
initialized_at=${new Date().toISOString()}
`,
  "utf-8",
);
