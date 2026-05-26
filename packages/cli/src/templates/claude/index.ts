/**
 * Claude Code templates
 *
 * Directory structure:
 *   claude/
 *   ├── agents/         # Sub-agent definitions
 *   └── settings.json   # Settings configuration
 *
 * Hooks come from shared-hooks/ (unified with other platforms).
 */

import { readdirSync, readFileSync } from "node:fs";
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
  language: TemplateLanguage = "en",
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

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir));
  } catch {
    return [];
  }
}

export const settingsTemplate = readTemplate("settings.json");

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface SettingsTemplate {
  targetPath: string;
  content: string;
}

export function getAllAgents(language: TemplateLanguage = "en"): AgentTemplate[] {
  const agents: AgentTemplate[] = [];
  const files = listFiles("agents/en").length > 0 ? listFiles("agents/en") : listFiles("agents");

  for (const file of files) {
    if (file.endsWith(".md")) {
      const name = file
        .replace(".md", "")
        .replace(/^(?:harness-spec|harness)-/, "harness-");
      const content = readLocalizedTemplate(`agents/${file}`, language);
      agents.push({ name, content });
    }
  }

  return agents;
}

export function getSettingsTemplate(
  language: TemplateLanguage = "en",
): SettingsTemplate {
  return {
    targetPath: "settings.json",
    content: readLocalizedTemplate("settings.json", language),
  };
}
