#!/usr/bin/env node

/**
 * Cross-platform script to copy template files to dist/
 *
 * This script copies src/templates/ to dist/templates/ while excluding
 * author-only TypeScript sources.
 *
 * The templates are GENERIC templates for user projects:
 * - src/templates/harness-spec/ - Personalized workflow scripts and config
 * - src/templates/claude/ - Claude Code commands, agents, hooks
 * - src/templates/codex/ - Codex skills
 * - src/templates/gemini/ - Gemini CLI commands (TOML)
 * - src/templates/markdown/ - Markdown templates (spec, guides)
 *
 * Note: We do not copy from any generated project-local workflow directories.
 * User projects customize those after init, so package templates remain the
 * single source of truth.
 */

import { cpSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const EXCLUDED_TEMPLATE_ENTRIES = new Set(["__pycache__", ".DS_Store"]);
const EXCLUDED_TEMPLATE_EXTENSIONS = new Set([".pyc", ".pyo", ".ts"]);

function shouldSkipTemplateEntry(entry) {
  return (
    EXCLUDED_TEMPLATE_ENTRIES.has(entry) ||
    EXCLUDED_TEMPLATE_EXTENSIONS.has(extname(entry))
  );
}

/**
 * Recursively copy directory, excluding source and runtime cache artifacts.
 * Ignored `__pycache__` directories can exist in src/templates; they must not
 * be copied into the npm tarball.
 *
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    if (shouldSkipTemplateEntry(entry)) {
      continue;
    }

    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

// Copy src/templates to dist/templates
copyDir("src/templates", "dist/templates");
console.log("Copied src/templates/ to dist/templates/");

console.log("Template copy complete.");
