/**
 * Codex templates
 *
 * These are GENERIC templates for user projects.
 * Do NOT use this repository's own .agents/skills or .codex directories
 * (which may be customized).
 *
 * Directory structure:
 *   codex/
 *   ├── agents/         # Project-scoped Codex custom agents (.toml)
 *   ├── codex-skills/   # Codex-specific skills → .codex/skills/
 *   ├── skills/         # Shared skills → .agents/skills/
 *   └── config.toml     # Project-scoped Codex config
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

function listDirectories(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(join(__dirname, dir)).sort();
  } catch {
    return [];
  }
}

export interface SkillTemplate {
  name: string;
  content: string;
}

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface ConfigTemplate {
  targetPath: string;
  content: string;
}

// Shared skills are now sourced from common/ templates (see templates/common/index.ts)

export function getAllAgents(language: TemplateLanguage = "en"): AgentTemplate[] {
  const agents: AgentTemplate[] = [];

  const files =
    listFiles("agents/en").length > 0 ? listFiles("agents/en") : listFiles("agents");

  for (const file of files) {
    if (!file.endsWith(".toml")) {
      continue;
    }

    const name = file
      .replace(".toml", "")
      .replace(/^(?:harness-spec|harness)-/, "harness-");
    const content = readLocalizedTemplate(`agents/${file}`, language);
    agents.push({ name, content });
  }

  return agents;
}

/**
 * Get Codex-specific skills (installed to .codex/skills/, not shared .agents/skills/).
 */
export function getAllCodexSkills(
  language: TemplateLanguage = "en",
): SkillTemplate[] {
  const skills: SkillTemplate[] = [];

  for (const name of listDirectories("codex-skills")) {
    const content = readLocalizedTemplate(`codex-skills/${name}/SKILL.md`, language);
    skills.push({ name, content });
  }

  return skills;
}

export interface HookTemplate {
  name: string;
  content: string;
}

export function getAllHooks(): HookTemplate[] {
  const hooks: HookTemplate[] = [];

  for (const file of listFiles("hooks")) {
    if (!file.endsWith(".js")) {
      continue;
    }
    hooks.push({ name: file, content: readTemplate(`hooks/${file}`) });
  }

  return hooks;
}

export function getHooksConfig(): string {
  return readTemplate("hooks.json");
}

export function getConfigTemplate(
  language: TemplateLanguage = "en",
): ConfigTemplate {
  return {
    targetPath: "config.toml",
    content: readLocalizedTemplate("config.toml", language),
  };
}
