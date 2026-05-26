import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES, getWorkflowDir } from "../constants/paths.js";
import type { TemplateLanguage } from "../commands/init.js";

interface HarnessPackageJson {
  harness?: {
    "spec-name"?: string;
    language?: TemplateLanguage;
  };
}

export function readHarnessConfig(cwd: string): HarnessPackageJson["harness"] | null {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf-8"),
    ) as HarnessPackageJson;
    return packageJson.harness ?? null;
  } catch {
    return null;
  }
}

export function getConfiguredWorkflowRoot(cwd: string): string {
  const specName = readHarnessConfig(cwd)?.["spec-name"]?.trim();
  if (specName) {
    return getWorkflowDir(specName);
  }

  return DIR_NAMES.WORKFLOW;
}

export function getConfiguredTemplateLanguage(
  cwd: string,
): TemplateLanguage {
  return readHarnessConfig(cwd)?.language === "cn" ? "cn" : "en";
}
