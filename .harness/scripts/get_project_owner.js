#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const scriptPath = process.argv[1];
const workflowRoot = scriptPath
  ? path.dirname(path.dirname(scriptPath))
  : ".harness";
const ownerFile = path.join(process.cwd(), workflowRoot, ".project-owner");

if (!fs.existsSync(ownerFile)) {
  process.exit(0);
}

const ownerLine = fs.readFileSync(ownerFile, "utf-8")
  .split("
")
  .find((line) => line.startsWith("name="));

if (!ownerLine) {
  process.exit(0);
}

process.stdout.write(ownerLine.slice(5).trim());
