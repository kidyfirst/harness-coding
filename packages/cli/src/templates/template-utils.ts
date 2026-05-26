/**
 * Shared utilities for platform template modules.
 * Eliminates boilerplate across qoder/, codebuddy/, droid/, cursor/, gemini/, kiro/ index.ts files.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateLanguage } from "../commands/init.js";

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface HookTemplate {
  targetPath: string;
  content: string;
}

export interface TemplateReader {
  readTemplate: (relativePath: string) => string;
  readLocalizedTemplate: (
    relativePath: string,
    language?: TemplateLanguage,
  ) => string;
  listFiles: (dir: string) => string[];
  listMdAgents: (dir?: string, language?: TemplateLanguage) => AgentTemplate[];
  listJsonAgents: (dir?: string, language?: TemplateLanguage) => AgentTemplate[];
  getSettings: (filename?: string) => HookTemplate;
  getLocalizedSettings: (
    filename?: string,
    language?: TemplateLanguage,
  ) => HookTemplate;
  getConfig: (filename: string, language?: TemplateLanguage) => string;
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

/**
 * Create a template reader bound to the caller's directory.
 * Usage: `const { readTemplate, listMdAgents, getSettings } = createTemplateReader(import.meta.url);`
 */
export function createTemplateReader(importMetaUrl: string): TemplateReader {
  const __dirname = dirname(fileURLToPath(importMetaUrl));

  function readTemplate(relativePath: string): string {
    return readFileSync(join(__dirname, relativePath), "utf-8");
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
      return readdirSync(join(__dirname, dir)).sort();
    } catch {
      return [];
    }
  }

  function listFilesFromLanguageDir(dir: string, language = "en"): string[] {
    try {
      return readdirSync(join(__dirname, dir, language)).sort();
    } catch {
      return listFiles(dir);
    }
  }

  /** Read all .md agent files from a subdirectory */
  function listMdAgents(
    dir = "agents",
    language: TemplateLanguage = "en",
  ): AgentTemplate[] {
    return listFilesFromLanguageDir(dir, "en")
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        name: f.replace(".md", "").replace(/^(?:harness-spec|harness)-/, "harness-"),
        content: readLocalizedTemplate(`${dir}/${f}`, language),
      }));
  }

  /** Read all .json agent files from a subdirectory (Kiro) */
  function listJsonAgents(
    dir = "agents",
    language: TemplateLanguage = "en",
  ): AgentTemplate[] {
    return listFilesFromLanguageDir(dir, "en")
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f.replace(".json", ""),
        content: readLocalizedTemplate(`${dir}/${f}`, language),
      }));
  }

  /** Read settings.json and return as HookTemplate */
  function getSettings(filename = "settings.json"): HookTemplate {
    return { targetPath: filename, content: readTemplate(filename) };
  }

  function getLocalizedSettings(
    filename = "settings.json",
    language: TemplateLanguage = "en",
  ): HookTemplate {
    return { targetPath: filename, content: readLocalizedTemplate(filename, language) };
  }

  /** Read a config file and return raw string */
  function getConfig(
    filename: string,
    language: TemplateLanguage = "en",
  ): string {
    return readLocalizedTemplate(filename, language);
  }

  return {
    readTemplate,
    readLocalizedTemplate,
    listFiles,
    listMdAgents,
    listJsonAgents,
    getSettings,
    getLocalizedSettings,
    getConfig,
  };
}
