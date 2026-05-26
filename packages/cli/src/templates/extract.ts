import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import { replaceCommandLiterals } from "../configurators/shared.js";
import type { TemplateLanguage } from "../commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TemplateCategory = "scripts" | "markdown" | "commands";

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

function readFileWithLanguageFallback(
  root: string,
  relativePath: string,
  language: TemplateLanguage = "en",
): string {
  const candidates =
    language === "en"
      ? [buildLanguagePath(relativePath, "en"), relativePath]
      : [
          buildLanguagePath(relativePath, language),
          buildLanguagePath(relativePath, "en"),
          relativePath,
        ];

  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  }

  throw new Error(`Template file not found: ${relativePath}`);
}

/**
 * Get the path to the harness-spec templates directory (workflow scaffolding).
 */
export function getHarnessSpecTemplatePath(): string {
  const templatePath = path.join(__dirname, "harness-spec");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }
  throw new Error(
    "Could not find harness-spec templates directory. Expected at templates/harness-spec/",
  );
}

export function getWorkflowTemplatePath(): string {
  return getHarnessSpecTemplatePath();
}

/**
 * Get the path to the claude templates directory (hooks, agents, settings).
 */
export function getClaudeTemplatePath(): string {
  const templatePath = path.join(__dirname, "claude");
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }
  throw new Error(
    "Could not find claude templates directory. Expected at templates/claude/",
  );
}

/**
 * Read a file from the harness-spec template directory.
 */
export function readHarnessSpecFile(relativePath: string): string {
  const templateRoot = getHarnessSpecTemplatePath();
  return readFileWithLanguageFallback(templateRoot, relativePath, "en");
}

/**
 * Read template content from a category directory.
 */
export function readTemplate(
  category: TemplateCategory,
  filename: string,
): string {
  const templateRoot = path.join(__dirname, category);
  return readFileWithLanguageFallback(templateRoot, filename, "en");
}

export function readScript(relativePath: string): string {
  if (relativePath.endsWith(".py")) {
    throw new Error(
      `Deprecated Python runtime path requested: ${relativePath}. Use the JavaScript runtime file instead.`,
    );
  }
  return readHarnessSpecFile(`scripts/${relativePath}`);
}

export function readMarkdown(relativePath: string): string {
  return readHarnessSpecFile(relativePath);
}

export function readCommand(filename: string): string {
  return readTemplate("commands", filename);
}

/**
 * Copy a directory from harness-spec templates to target, making scripts executable.
 */
export async function copyHarnessSpecDir(
  srcRelativePath: string,
  destPath: string,
  options?: { executable?: boolean },
): Promise<void> {
  const templateRoot = getHarnessSpecTemplatePath();
  const srcPath = path.join(templateRoot, srcRelativePath);
  await copyDirRecursive(srcPath, destPath, options);
}

async function copyDirRecursive(
  src: string,
  dest: string,
  options?: { executable?: boolean },
): Promise<void> {
  ensureDir(dest);

  for (const entry of fs.readdirSync(src)) {
    if (
      entry.endsWith(".py") ||
      entry.endsWith(".ts") ||
      entry === "__pycache__"
    ) {
      continue;
    }
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, options);
    } else {
      const content = fs.readFileSync(srcPath, "utf-8");
      const isExecutable =
        options?.executable && (entry.endsWith(".sh") || entry.endsWith(".js"));
      await writeFile(destPath, replaceCommandLiterals(content), {
        executable: isExecutable,
      });
    }
  }
}
