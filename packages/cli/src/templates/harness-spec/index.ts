/**
 * Harness Spec workflow templates
 *
 * These are generic templates for user projects.
 *
 * Directory structure:
 *   harness-spec/
 *   ├── scripts/
 *   │   ├── *.ts              # Authored source files
 *   │   ├── *.js              # Runtime files written into user projects
 *   │   └── common/           # Shared runtime helpers
 *   ├── workflow.md           # Workflow guide
 *   ├── config.yaml           # Harness configuration
 *   └── gitignore.txt         # .gitignore content
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateLanguage } from "../../commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

function buildLanguagePath(
  relativePath: string,
  language: TemplateLanguage,
): string {
  const lastSlash = relativePath.lastIndexOf("/");
  if (lastSlash === -1) {
    return `${language}/${relativePath}`;
  }
  const dir = relativePath.slice(0, lastSlash);
  const file = relativePath.slice(lastSlash + 1);
  return `${dir}/${language}/${file}`;
}

function readLocalizedTemplate(
  relativePath: string,
  language: TemplateLanguage,
): string {
  const localizedPath = buildLanguagePath(relativePath, language);
  try {
    return readTemplate(localizedPath);
  } catch {
    if (language !== "en") {
      try {
        return readTemplate(buildLanguagePath(relativePath, "en"));
      } catch {
        return readTemplate(relativePath);
      }
    }
    return readTemplate(relativePath);
  }
}

// Runtime workflow entrypoints
export const getProjectOwnerScript = readTemplate("scripts/get_project_owner.js");
export const initProjectOwnerScript = readTemplate("scripts/init_project_owner.js");
export const taskScript = readTemplate("scripts/task.js");
export const getContextScript = readTemplate("scripts/get_context.js");
export const addSessionScript = readTemplate("scripts/add_session.js");

// Configuration files
export const workflowMdTemplate = readLocalizedTemplate("workflow.md", "en");
export const configYamlTemplate = readTemplate("config.yaml");
export const gitignoreTemplate = readTemplate("gitignore.txt");

export function getWorkflowMdTemplate(language: TemplateLanguage): string {
  return readLocalizedTemplate("workflow.md", language);
}

export function getConfigYamlTemplate(language: TemplateLanguage): string {
  return readLocalizedTemplate("config.yaml", language);
}

/**
 * Get all script templates as a map of relative path to content
 */
export function getAllScripts(): Map<string, string> {
  const scripts = new Map<string, string>();

  scripts.set("get_project_owner.js", getProjectOwnerScript);
  scripts.set("init_project_owner.js", initProjectOwnerScript);
  scripts.set("task.js", taskScript);
  scripts.set("get_context.js", getContextScript);
  scripts.set("add_session.js", addSessionScript);

  return scripts;
}
