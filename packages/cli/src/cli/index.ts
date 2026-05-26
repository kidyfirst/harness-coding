import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { init } from "../commands/init.js";
import { update } from "../commands/update.js";
import { uninstall } from "../commands/uninstall.js";
import { VERSION, PACKAGE_NAME } from "../constants/version.js";
import { compareVersions } from "../utils/compare-versions.js";
import { getConfiguredWorkflowRoot } from "../utils/workflow-root.js";

export { VERSION, PACKAGE_NAME };

function checkForUpdates(cwd: string): void {
  const versionFile = path.join(cwd, getConfiguredWorkflowRoot(cwd), ".version");
  if (!fs.existsSync(versionFile)) return;

  const projectVersion = fs.readFileSync(versionFile, "utf-8").trim();
  const cliVersion = VERSION;
  const comparison = compareVersions(cliVersion, projectVersion);

  if (comparison > 0) {
    console.log(
      chalk.yellow(
        `\n⚠️  Harness Spec update available: ${projectVersion} → ${cliVersion}`,
      ),
    );
    console.log(chalk.gray(`   Run: harness-spec update\n`));
  } else if (comparison < 0) {
    console.log(
      chalk.yellow(
        `\n⚠️  Your CLI (${cliVersion}) is older than project (${projectVersion})`,
      ),
    );
    console.log(chalk.gray(`   Run: npm install -g ${PACKAGE_NAME}\n`));
  }
}

const cwd = process.cwd();
if (fs.existsSync(path.join(cwd, getConfiguredWorkflowRoot(cwd)))) {
  checkForUpdates(cwd);
}

const program = new Command();

program
  .name("harness-spec")
  .description(
    "Personalized AI workflow toolkit for Claude Code, Codex, and Gemini CLI",
  )
  .version(VERSION, "-v, --version", "output the version number");

program
  .command("init")
  .description("Initialize harness-spec in the current project")
  .option("--claude", "Include Claude Code commands")
  .option("--codex", "Include Codex skills")
  .option("--gemini", "Include Gemini CLI commands")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option(
    "-p, --project <name>",
    "Initialize project personalization with the specified name",
  )
  .option(
    "-l, --lang <en|cn>",
    "Template language for generated markdown files",
  )
  .option("-f, --force", "Overwrite existing files without asking")
  .option("-s, --skip-existing", "Skip existing files without asking")
  .option("--monorepo", "Force monorepo mode")
  .option("--no-monorepo", "Skip monorepo detection")
  .option(
    "-t, --template <name>",
    "Use a remote spec template (e.g., electron-fullstack)",
  )
  .option(
    "--overwrite",
    "Overwrite existing spec directory when using template",
  )
  .option("--append", "Only add missing files when using template")
  .option(
    "-r, --registry <source>",
    "Use a custom template registry (e.g., gh:myorg/myrepo/specs)",
  )
  .action(async (options: Record<string, unknown>) => {
    try {
      await init(options);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.HARNESS_SPEC_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Update harness-spec configuration and commands to latest version")
  .option("--dry-run", "Preview changes without applying them")
  .option("-f, --force", "Overwrite all changed files without asking")
  .option("-s, --skip-all", "Skip all changed files without asking")
  .option("-n, --create-new", "Create .new copies for all changed files")
  .action(async (options: Record<string, unknown>) => {
    try {
      await update({
        dryRun: options.dryRun as boolean,
        force: options.force as boolean,
        skipAll: options.skipAll as boolean,
        createNew: options.createNew as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.HARNESS_SPEC_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description(
    "Remove all harness-spec files from this project",
  )
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--dry-run", "List what would be removed without changing anything")
  .action(async (options: Record<string, unknown>) => {
    try {
      await uninstall({
        yes: options.yes as boolean,
        dryRun: options.dryRun as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.HARNESS_SPEC_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program.parse();
