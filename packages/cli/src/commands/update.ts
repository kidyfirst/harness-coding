import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import type { AITool } from "../types/ai-tools.js";
import { VERSION, PACKAGE_NAME } from "../constants/version.js";
import {
  loadHashes,
  updateHashes,
  computeHash,
} from "../utils/template-hash.js";
import { compareVersions } from "../utils/compare-versions.js";
import { setupProxy } from "../utils/proxy.js";
import {
  getConfiguredTemplateLanguage,
  getConfiguredWorkflowRoot,
  readHarnessConfig,
} from "../utils/workflow-root.js";
import type { TemplateLanguage } from "./init.js";

import {
  getAllScripts,
  getConfigYamlTemplate,
  getWorkflowMdTemplate,
  gitignoreTemplate,
} from "../templates/harness-spec/index.js";
import { renderAgentsMdContent } from "../templates/markdown/index.js";
import { getWorkflowDir } from "../constants/paths.js";

import {
  ALL_MANAGED_DIRS,
  getConfiguredPlatforms,
  collectPlatformTemplates,
  isManagedPath,
  isManagedRootDir,
} from "../configurators/index.js";
import { replaceCommandLiterals } from "../configurators/shared.js";
import { pruneOrphanManifestKeys } from "../utils/manifest-prune.js";

export interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
}

interface FileChange {
  path: string;
  relativePath: string;
  newContent: string;
  status: "new" | "unchanged" | "changed";
}

interface ChangeAnalysis {
  newFiles: FileChange[];
  unchangedFiles: FileChange[];
  autoUpdateFiles: FileChange[];
  changedFiles: FileChange[];
  userDeletedFiles: FileChange[];
  protectedPaths: string[];
}

type ConflictAction = "overwrite" | "skip" | "create-new";

const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
const MANAGED_BLOCK_START = "<!-- HARNESS:START -->";
const MANAGED_BLOCK_END = "<!-- HARNESS:END -->";
// spec/ is intentionally user-owned after init and should never be rewritten.
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`,
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`,
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`,
  `${DIR_NAMES.WORKFLOW}/.project-owner`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];

function getWorkflowRoot(cwd: string): string {
  return getConfiguredWorkflowRoot(cwd);
}

function resolveWorkflowPath(cwd: string, relativePath: string): string {
  return relativePath.replaceAll(DIR_NAMES.WORKFLOW, getWorkflowRoot(cwd));
}

function getManagedBlock(content: string): string | null {
  const start = content.indexOf(MANAGED_BLOCK_START);
  if (start === -1) return null;

  const end = content.indexOf(MANAGED_BLOCK_END, start);
  if (end === -1) return null;

  return content.slice(start, end + MANAGED_BLOCK_END.length);
}

function replaceManagedBlock(
  existingContent: string,
  templateContent: string,
): string | null {
  const existingStart = existingContent.indexOf(MANAGED_BLOCK_START);
  if (existingStart === -1) return null;

  const existingEnd = existingContent.indexOf(MANAGED_BLOCK_END, existingStart);
  if (existingEnd === -1) return null;

  const templateBlock = getManagedBlock(templateContent);
  if (!templateBlock) return null;

  return (
    existingContent.slice(0, existingStart) +
    templateBlock +
    existingContent.slice(existingEnd + MANAGED_BLOCK_END.length)
  );
}

function buildAgentsMdTemplate(cwd: string): string {
  let workflowRoot: string = DIR_NAMES.WORKFLOW;
  const harnessConfig = readHarnessConfig(cwd);
  const specName = harnessConfig?.["spec-name"]?.trim();
  if (specName) {
    workflowRoot = getWorkflowDir(specName);
  }

  const agentsMdContent = renderAgentsMdContent(
    workflowRoot,
    getConfiguredTemplateLanguage(cwd),
  );
  const fullPath = path.join(cwd, FILE_NAMES.AGENTS);
  if (!fs.existsSync(fullPath)) {
    return agentsMdContent;
  }

  const existingContent = fs.readFileSync(fullPath, "utf-8");
  const replaced = replaceManagedBlock(existingContent, agentsMdContent);
  if (replaced !== null) {
    return replaced;
  }

  const templateBlock = getManagedBlock(agentsMdContent);
  if (!templateBlock) {
    return agentsMdContent;
  }

  const trimmed = existingContent.replace(/\s+$/, "");
  return `${trimmed}\n\n${templateBlock}\n`;
}

export function loadUpdateSkipPaths(cwd: string): string[] {
  const configPath = path.join(cwd, getWorkflowRoot(cwd), "config.yaml");
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    const paths: string[] = [];
    let inUpdate = false;
    let inSkip = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      if (/^update:\s*$/.test(trimmed)) {
        inUpdate = true;
        inSkip = false;
        continue;
      }

      if (inUpdate && /^\s+skip:\s*$/.test(trimmed)) {
        inSkip = true;
        continue;
      }

      if (inSkip) {
        const match = trimmed.match(/^\s+-\s+(.+)$/);
        if (match) {
          paths.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
          continue;
        }

        if (trimmed !== "" && !trimmed.startsWith("#")) {
          inSkip = false;
          inUpdate = false;
        }
      }

      if (
        inUpdate &&
        trimmed !== "" &&
        !trimmed.startsWith(" ") &&
        !trimmed.startsWith("#")
      ) {
        inUpdate = false;
        inSkip = false;
      }
    }

    return paths;
  } catch {
    console.warn(
      `Warning: failed to parse ${configPath}, update.skip rules will not be applied`,
    );
    return [];
  }
}

function preserveExistingClaudeStatusLine(
  cwd: string,
  templates: Map<string, string>,
): void {
  const newSettingsContent = templates.get(CLAUDE_SETTINGS_PATH);
  if (!newSettingsContent) return;

  const settingsPath = path.join(cwd, CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(settingsPath)) return;

  try {
    const existingSettings = JSON.parse(
      fs.readFileSync(settingsPath, "utf-8"),
    ) as Record<string, unknown>;

    if (!Object.prototype.hasOwnProperty.call(existingSettings, "statusLine")) {
      return;
    }

    const newSettings = JSON.parse(newSettingsContent) as Record<
      string,
      unknown
    >;

    if (Object.prototype.hasOwnProperty.call(newSettings, "statusLine")) {
      return;
    }

    newSettings.statusLine = existingSettings.statusLine;
    templates.set(
      CLAUDE_SETTINGS_PATH,
      `${JSON.stringify(newSettings, null, 2)}\n`,
    );
  } catch {
    // Invalid JSON is handled later by the normal conflict flow.
  }
}

function collectTemplateFiles(
  cwd: string,
  extraPlatforms?: Set<AITool>,
): Map<string, string> {
  const files = new Map<string, string>();
  const platforms = getConfiguredPlatforms(cwd);
  const language: TemplateLanguage = getConfiguredTemplateLanguage(cwd);

  if (extraPlatforms) {
    for (const platform of extraPlatforms) {
      platforms.add(platform);
    }
  }

  for (const [scriptPath, content] of getAllScripts()) {
    files.set(resolveWorkflowPath(cwd, `${DIR_NAMES.WORKFLOW}/scripts/${scriptPath}`), content);
  }

  files.set(
    resolveWorkflowPath(cwd, `${DIR_NAMES.WORKFLOW}/config.yaml`),
    getConfigYamlTemplate(language),
  );
  files.set(
    resolveWorkflowPath(cwd, `${DIR_NAMES.WORKFLOW}/.gitignore`),
    gitignoreTemplate,
  );
  files.set(
    resolveWorkflowPath(cwd, `${DIR_NAMES.WORKFLOW}/workflow.md`),
    getWorkflowMdTemplate(language),
  );
  files.set(FILE_NAMES.AGENTS, buildAgentsMdTemplate(cwd));

  for (const platformId of platforms) {
    const platformFiles = collectPlatformTemplates(platformId, language);
    if (!platformFiles) continue;
    for (const [filePath, content] of platformFiles) {
      files.set(filePath, content);
    }
  }

  preserveExistingClaudeStatusLine(cwd, files);

  const skipPaths = loadUpdateSkipPaths(cwd);
  if (skipPaths.length > 0) {
    for (const [filePath] of [...files]) {
      if (
        skipPaths.some(
          (skip) =>
            filePath === skip ||
            filePath.startsWith(skip.endsWith("/") ? skip : `${skip}/`),
        )
      ) {
        files.delete(filePath);
      }
    }
  }

  for (const [filePath, content] of files) {
    files.set(filePath, replaceCommandLiterals(content));
  }

  return files;
}

function analyzeChanges(
  cwd: string,
  hashes: Record<string, string>,
  templates: Map<string, string>,
): ChangeAnalysis {
  const result: ChangeAnalysis = {
    newFiles: [],
    unchangedFiles: [],
    autoUpdateFiles: [],
    changedFiles: [],
    userDeletedFiles: [],
    protectedPaths: PROTECTED_PATHS,
  };

  for (const [relativePath, newContent] of templates) {
    const fullPath = path.join(cwd, relativePath);
    const exists = fs.existsSync(fullPath);

    const change: FileChange = {
      path: fullPath,
      relativePath,
      newContent,
      status: "new",
    };

    if (!exists) {
      if (hashes[relativePath]) {
        result.userDeletedFiles.push(change);
      } else {
        result.newFiles.push(change);
      }
      continue;
    }

    const existingContent = fs.readFileSync(fullPath, "utf-8");
    if (existingContent === newContent) {
      change.status = "unchanged";
      result.unchangedFiles.push(change);
      continue;
    }

    const storedHash = hashes[relativePath];
    const currentHash = computeHash(existingContent);
    if (storedHash && storedHash === currentHash) {
      change.status = "changed";
      result.autoUpdateFiles.push(change);
    } else {
      change.status = "changed";
      result.changedFiles.push(change);
    }
  }

  return result;
}

function printChangeSummary(changes: ChangeAnalysis): void {
  console.log("\nScanning for changes...\n");

  if (changes.newFiles.length > 0) {
    console.log(chalk.green("  New files (will add):"));
    for (const file of changes.newFiles) {
      console.log(chalk.green(`    + ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.cyan("  Template updated (will auto-update):"));
    for (const file of changes.autoUpdateFiles) {
      console.log(chalk.cyan(`    ↑ ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.unchangedFiles.length > 0) {
    console.log(chalk.gray("  Unchanged files (will skip):"));
    for (const file of changes.unchangedFiles.slice(0, 5)) {
      console.log(chalk.gray(`    ○ ${file.relativePath}`));
    }
    if (changes.unchangedFiles.length > 5) {
      console.log(
        chalk.gray(`    ... and ${changes.unchangedFiles.length - 5} more`),
      );
    }
    console.log("");
  }

  if (changes.changedFiles.length > 0) {
    console.log(chalk.yellow("  Modified by you (need your decision):"));
    for (const file of changes.changedFiles) {
      console.log(chalk.yellow(`    ? ${file.relativePath}`));
    }
    console.log("");
  }

  if (changes.userDeletedFiles.length > 0) {
    console.log(chalk.gray("  Deleted by you (preserved):"));
    for (const file of changes.userDeletedFiles) {
      console.log(chalk.gray(`    ✕ ${file.relativePath}`));
    }
    console.log("");
  }

  const existingProtectedPaths = changes.protectedPaths.filter((protectedPath) =>
    fs.existsSync(path.join(process.cwd(), protectedPath)),
  );

  if (existingProtectedPaths.length > 0) {
    console.log(chalk.gray("  User data (preserved):"));
    for (const protectedPath of existingProtectedPaths) {
      console.log(chalk.gray(`    ○ ${protectedPath}/`));
    }
    console.log("");
  }
}

async function promptConflictResolution(
  file: FileChange,
  options: UpdateOptions,
  applyToAll: { action: ConflictAction | null },
): Promise<ConflictAction> {
  if (applyToAll.action) {
    return applyToAll.action;
  }
  if (options.force) {
    return "overwrite";
  }
  if (options.skipAll) {
    return "skip";
  }
  if (options.createNew) {
    return "create-new";
  }

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: "list",
      name: "action",
      message: `${file.relativePath} has changes.`,
      choices: [
        {
          name: "[1] Overwrite - Replace with new version",
          value: "overwrite",
        },
        { name: "[2] Skip - Keep your current version", value: "skip" },
        {
          name: "[3] Create copy - Save new version as .new",
          value: "create-new",
        },
        { name: "[a] Apply Overwrite to all", value: "overwrite-all" },
        { name: "[s] Apply Skip to all", value: "skip-all" },
        { name: "[n] Apply Create copy to all", value: "create-new-all" },
      ],
      default: "skip",
    },
  ]);

  if (action === "overwrite-all") {
    applyToAll.action = "overwrite";
    return "overwrite";
  }
  if (action === "skip-all") {
    applyToAll.action = "skip";
    return "skip";
  }
  if (action === "create-new-all") {
    applyToAll.action = "create-new";
    return "create-new";
  }

  return action as ConflictAction;
}

function createBackupDirPath(cwd: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(cwd, getWorkflowRoot(cwd), `.backup-${timestamp}`);
}

function backupFile(
  cwd: string,
  backupDir: string,
  relativePath: string,
): void {
  const srcPath = path.join(cwd, relativePath);
  if (!fs.existsSync(srcPath)) return;

  const backupPath = path.join(backupDir, relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(srcPath, backupPath);
}

const BACKUP_DIRS = ALL_MANAGED_DIRS;
const BACKUP_FILES = [FILE_NAMES.AGENTS] as const;
const BACKUP_EXCLUDE_PATTERNS = [
  ".backup-",
  "/node_modules",
  "/workspace/",
  "/tasks/",
  "/spec/",
  "/backlog/",
  "/agent-traces/",
  "/worktrees/",
  "/worktree/",
];

export function shouldExcludeFromBackup(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of BACKUP_EXCLUDE_PATTERNS) {
    if (normalized.includes(pattern)) return true;
  }
  return false;
}

function collectAllFiles(dirPath: string, cwd = process.cwd()): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(cwd, fullPath);

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (!shouldExcludeFromBackup(relativePath)) {
          stack.push(fullPath);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function createFullBackup(cwd: string): string | null {
  const backupDir = createBackupDirPath(cwd);
  let hasFiles = false;

  for (const dir of BACKUP_DIRS) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = collectAllFiles(dirPath, cwd);
    for (const fullPath of files) {
      const relativePath = path.relative(cwd, fullPath);
      if (shouldExcludeFromBackup(relativePath)) continue;

      if (!hasFiles) {
        fs.mkdirSync(backupDir, { recursive: true });
        hasFiles = true;
      }
      backupFile(cwd, backupDir, relativePath);
    }
  }

  for (const relativePath of BACKUP_FILES) {
    const fullPath = path.join(cwd, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    if (shouldExcludeFromBackup(relativePath)) continue;

    if (!hasFiles) {
      fs.mkdirSync(backupDir, { recursive: true });
      hasFiles = true;
    }
    backupFile(cwd, backupDir, relativePath);
  }

  return hasFiles ? backupDir : null;
}

function updateVersionFile(cwd: string): void {
  const versionPath = path.join(cwd, getWorkflowRoot(cwd), ".version");
  fs.writeFileSync(versionPath, VERSION);
}

function getInstalledVersion(cwd: string): string {
  const versionPath = path.join(cwd, getWorkflowRoot(cwd), ".version");
  if (fs.existsSync(versionPath)) {
    return fs.readFileSync(versionPath, "utf-8").trim();
  }
  return "unknown";
}

async function getLatestNpmVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function cleanupEmptyDirs(cwd: string, dirPath: string): void {
  const fullPath = path.join(cwd, dirPath);
  const workflowRoot = getWorkflowRoot(cwd);

  if (!isManagedPath(dirPath)) return;
  if (dirPath === workflowRoot || isManagedRootDir(dirPath)) return;
  if (!fs.existsSync(fullPath)) return;

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) return;

    const contents = fs.readdirSync(fullPath);
    if (contents.length === 0) {
      fs.rmdirSync(fullPath);
      const parent = path.dirname(dirPath);
      if (
        parent !== "." &&
        parent !== dirPath &&
        parent !== workflowRoot &&
        !isManagedRootDir(parent)
      ) {
        cleanupEmptyDirs(cwd, parent);
      }
    }
  } catch {
    // Best effort cleanup only.
  }
}

function writeManagedFile(file: FileChange): void {
  const dir = path.dirname(file.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file.path, file.newContent);

  if (
    file.relativePath.endsWith(".sh") ||
    file.relativePath.endsWith(".js")
  ) {
    fs.chmodSync(file.path, "755");
  }
}

export async function update(options: UpdateOptions): Promise<void> {
  const cwd = process.cwd();
  const workflowRoot = getWorkflowRoot(cwd);

  if (!fs.existsSync(path.join(cwd, workflowRoot))) {
    console.log(
      chalk.red("Error: Harness Spec is not initialized in this directory."),
    );
    console.log(chalk.gray("Run 'harness-spec init -p your-name' first."));
    return;
  }

  console.log(chalk.cyan("\nHarness Spec Update"));
  console.log(chalk.cyan("═══════════════════\n"));

  setupProxy();

  const projectVersion = getInstalledVersion(cwd);
  const cliVersion = VERSION;
  const latestNpmVersion = await getLatestNpmVersion();

  const cliVsProject =
    projectVersion === "unknown" ? 1 : compareVersions(cliVersion, projectVersion);
  const cliVsNpm = latestNpmVersion
    ? compareVersions(cliVersion, latestNpmVersion)
    : 0;

  console.log(`Project version: ${chalk.white(projectVersion)}`);
  console.log(`CLI version:     ${chalk.white(cliVersion)}`);
  if (latestNpmVersion) {
    console.log(`Latest on npm:   ${chalk.white(latestNpmVersion)}`);
  } else {
    console.log(chalk.gray("Latest on npm:   (unable to fetch)"));
  }
  console.log("");

  if (cliVsNpm < 0 && latestNpmVersion) {
    console.log(
      chalk.yellow(
        `⚠️  Your CLI (${cliVersion}) is behind npm (${latestNpmVersion}).`,
      ),
    );
    console.log(chalk.yellow(`   Run: npm install -g ${PACKAGE_NAME}\n`));
  }

  if (projectVersion !== "unknown" && cliVsProject < 0) {
    console.log(
      chalk.red(
        `❌ Cannot update: CLI version (${cliVersion}) < project version (${projectVersion})`,
      ),
    );
    console.log(
      chalk.gray("   Update the CLI first instead of downgrading the project."),
    );
    console.log(chalk.gray(`   Run: npm install -g ${PACKAGE_NAME}`));
    return;
  }

  if (projectVersion === "unknown") {
    console.log(
      chalk.yellow(
        "⚠️  No version file found. The workflow metadata will be repaired during this update.\n",
      ),
    );
  }

  let hashes = loadHashes(cwd);
  const isFirstHashTracking = Object.keys(hashes).length === 0;

  {
    const configuredPlatforms = new Set<AITool>(getConfiguredPlatforms(cwd));
    const prune = pruneOrphanManifestKeys(cwd, [...configuredPlatforms], hashes);
    if (prune.pruned.length > 0) {
      console.log(
        chalk.gray(
          `   Pruned ${prune.pruned.length} orphan manifest entries from .template-hashes.json`,
        ),
      );
      hashes = prune.hashes;
    }
  }

  const templates = collectTemplateFiles(cwd);
  const changes = analyzeChanges(cwd, hashes, templates);
  printChangeSummary(changes);

  if (isFirstHashTracking && changes.changedFiles.length > 0) {
    console.log(chalk.cyan("ℹ️  First update with hash tracking enabled."));
    console.log(
      chalk.gray(
        "   Changed files shown above may not be actual user modifications.",
      ),
    );
    console.log(
      chalk.gray(
        "   After this update, hash tracking will accurately detect changes.\n",
      ),
    );
  }

  const isUpgrade = projectVersion !== "unknown" && cliVsProject > 0;
  const isSameVersion = projectVersion !== "unknown" && cliVsProject === 0;

  if (
    changes.newFiles.length === 0 &&
    changes.autoUpdateFiles.length === 0 &&
    changes.changedFiles.length === 0
  ) {
    if (!options.dryRun) {
      updateVersionFile(cwd);
    }

    if (isSameVersion) {
      console.log(chalk.green("✓ Already up to date!"));
    } else if (isUpgrade) {
      console.log(
        chalk.green(`✓ No file changes needed for ${projectVersion} → ${cliVersion}`),
      );
    } else {
      console.log(chalk.green("✓ No file changes needed."));
    }
    return;
  }

  if (isUpgrade) {
    console.log(
      chalk.green(`This will UPGRADE: ${projectVersion} → ${cliVersion}\n`),
    );
  } else if (projectVersion === "unknown") {
    console.log(
      chalk.green("This will repair workflow metadata and refresh managed files.\n"),
    );
  }

  if (options.dryRun) {
    console.log(chalk.gray("[Dry run] No changes made."));
    return;
  }

  if (!options.force && !options.skipAll && !options.createNew) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Proceed?",
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.yellow("Update cancelled."));
      return;
    }
  }

  const backupDir = createFullBackup(cwd);
  if (backupDir) {
    console.log(chalk.gray(`\nBackup created: ${path.relative(cwd, backupDir)}/`));
  }

  let added = 0;
  let autoUpdated = 0;
  let updated = 0;
  let skipped = 0;
  let createdNew = 0;

  if (changes.newFiles.length > 0) {
    console.log(chalk.blue("\nAdding new files..."));
    for (const file of changes.newFiles) {
      writeManagedFile(file);
      console.log(chalk.green(`  + ${file.relativePath}`));
      added++;
    }
  }

  if (changes.autoUpdateFiles.length > 0) {
    console.log(chalk.blue("\nAuto-updating template files..."));
    for (const file of changes.autoUpdateFiles) {
      writeManagedFile(file);
      console.log(chalk.cyan(`  ↑ ${file.relativePath}`));
      autoUpdated++;
    }
  }

  if (changes.changedFiles.length > 0) {
    console.log(chalk.blue("\n--- Resolving conflicts ---\n"));
    const applyToAll: { action: ConflictAction | null } = { action: null };

    for (const file of changes.changedFiles) {
      const action = await promptConflictResolution(file, options, applyToAll);

      if (action === "overwrite") {
        writeManagedFile(file);
        console.log(chalk.yellow(`  ✓ Overwritten: ${file.relativePath}`));
        updated++;
      } else if (action === "create-new") {
        fs.writeFileSync(`${file.path}.new`, file.newContent);
        console.log(chalk.blue(`  ✓ Created: ${file.relativePath}.new`));
        createdNew++;
      } else {
        console.log(chalk.gray(`  ○ Skipped: ${file.relativePath}`));
        skipped++;
      }
    }
  }

  updateVersionFile(cwd);

  const filesToHash = new Map<string, string>();
  for (const file of changes.newFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  for (const file of changes.autoUpdateFiles) {
    filesToHash.set(file.relativePath, file.newContent);
  }
  for (const file of changes.changedFiles) {
    const fullPath = path.join(cwd, file.relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    if (content === file.newContent) {
      filesToHash.set(file.relativePath, file.newContent);
    }
  }
  if (filesToHash.size > 0) {
    updateHashes(cwd, filesToHash);
  }

  console.log(chalk.cyan("\n--- Summary ---\n"));
  if (added > 0) console.log(`  Added: ${added} file(s)`);
  if (autoUpdated > 0) console.log(`  Auto-updated: ${autoUpdated} file(s)`);
  if (updated > 0) console.log(`  Updated: ${updated} file(s)`);
  if (skipped > 0) console.log(`  Skipped: ${skipped} file(s)`);
  if (createdNew > 0) {
    console.log(`  Created .new copies: ${createdNew} file(s)`);
  }
  if (backupDir) {
    console.log(`  Backup: ${path.relative(cwd, backupDir)}/`);
  }

  console.log(
    chalk.green(
      `\n✅ Update complete! (${projectVersion} → ${cliVersion})`,
    ),
  );

  if (createdNew > 0) {
    console.log(
      chalk.gray("\nTip: Review .new files and merge changes manually if needed."),
    );
  }
}
