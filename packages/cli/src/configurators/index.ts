import fs from "node:fs";
import path from "node:path";
import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import type { TemplateLanguage } from "../commands/init.js";
import {
  AI_TOOLS,
  getManagedPaths,
  type AITool,
  type CliFlag,
} from "../types/ai-tools.js";
import { configureClaude } from "./claude.js";
import { configureCodex } from "./codex.js";
import { configureGemini } from "./gemini.js";
import {
  replaceCommandLiterals,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  resolveCodexHarnessStartSkill,
  resolveCommands,
  resolvePlaceholders,
  resolveSkills,
  resolveSkillsNeutral,
  collectSkillTemplates,
  applyPullBasedPreludeMarkdown,
  applyPullBasedPreludeToml,
} from "./shared.js";
import {
  getAllAgents as getClaudeAgents,
  getSettingsTemplate as getClaudeSettings,
} from "../templates/claude/index.js";
import {
  getAllAgents as getCodexAgents,
  getAllCodexSkills as getCodexPlatformSkills,
  getAllHooks as getCodexHooks,
  getConfigTemplate as getCodexConfigTemplate,
  getHooksConfig as getCodexHooksConfig,
} from "../templates/codex/index.js";
import {
  getAllAgents as getGeminiAgents,
  getSettingsTemplate as getGeminiSettings,
} from "../templates/gemini/index.js";
import {
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../templates/shared-hooks/index.js";

interface PlatformFunctions {
  configure: (cwd: string, language?: TemplateLanguage) => Promise<void>;
  collectTemplates?: (language?: TemplateLanguage) => Map<string, string>;
}

function collectSharedHooks(
  hooksPath: string,
  platform: SharedHookPlatform,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const hook of getSharedHookScriptsForPlatform(platform)) {
    files.set(`${hooksPath}/${hook.name}`, hook.content);
  }
  return files;
}

function replaceInMap(map: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, content] of map) {
    result.set(key, replaceCommandLiterals(content));
  }
  return result;
}

function collectBothTemplates(
  ctx: import("../types/ai-tools.js").TemplateContext,
  cmdPath: (name: string) => string,
  skillRoot: string,
  language: TemplateLanguage,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const cmd of resolveCommands(ctx)) {
    files.set(cmdPath(cmd.name), cmd.content);
  }
  for (const [filePath, content] of collectSkillTemplates(
    skillRoot,
    resolveSkills(ctx, language),
    resolveBundledSkills(ctx, language),
  )) {
    files.set(filePath, content);
  }
  return files;
}

const PLATFORM_FUNCTIONS: Record<AITool, PlatformFunctions> = {
  "claude-code": {
    configure: configureClaude,
    collectTemplates: (language = "en") => {
      const ctx = AI_TOOLS["claude-code"].templateContext;
      const files = collectBothTemplates(
        ctx,
        (name) => `.claude/commands/harness-spec/${name}.md`,
        ".claude/skills",
        language,
      );
      for (const agent of getClaudeAgents(language)) {
        files.set(`.claude/agents/${agent.name}.md`, agent.content);
      }
      for (const [key, value] of collectSharedHooks(".claude/hooks", "claude")) {
        files.set(key, value);
      }
      const settings = getClaudeSettings(language);
      files.set(
        `.claude/${settings.targetPath}`,
        resolvePlaceholders(settings.content),
      );
      return files;
    },
  },
  codex: {
    configure: configureCodex,
    collectTemplates: (language = "en") => {
      const ctx = AI_TOOLS.codex.templateContext;
      const files = new Map<string, string>();
      for (const [filePath, content] of collectSkillTemplates(
        ".agents/skills",
        resolveAllAsSkillsNeutral(ctx, language),
        resolveBundledSkills(ctx, language),
      )) {
        files.set(filePath, content);
      }
      const startSkill = resolveCodexHarnessStartSkill(ctx, language);
      if (startSkill) {
        files.set(`.agents/skills/${startSkill.name}/SKILL.md`, startSkill.content);
      }
      for (const skill of getCodexPlatformSkills(language)) {
        files.set(`.codex/skills/${skill.name}/SKILL.md`, skill.content);
      }
      for (const agent of applyPullBasedPreludeToml(getCodexAgents(language), language)) {
        files.set(`.codex/agents/${agent.name}.toml`, agent.content);
      }
      for (const hook of getCodexHooks()) {
        files.set(`.codex/hooks/${hook.name}`, hook.content);
      }
      for (const [key, value] of collectSharedHooks(".codex/hooks", "codex")) {
        files.set(key, value);
      }
      files.set(
        ".codex/hooks.json",
        resolvePlaceholders(getCodexHooksConfig()),
      );
      const config = getCodexConfigTemplate(language);
      files.set(`.codex/${config.targetPath}`, config.content);
      return files;
    },
  },
  gemini: {
    configure: configureGemini,
    collectTemplates: (language = "en") => {
      const ctx = AI_TOOLS.gemini.templateContext;
      const files = new Map<string, string>();
      for (const cmd of resolveCommands(ctx)) {
        const toml = `description = "Harness Spec: ${cmd.name}"\n\nprompt = """\n${cmd.content}\n"""\n`;
        files.set(`.gemini/commands/harness-spec/${cmd.name}.toml`, toml);
      }
      for (const [filePath, content] of collectSkillTemplates(
        ".agents/skills",
        resolveSkillsNeutral(ctx, language),
        resolveBundledSkills(ctx, language),
      )) {
        files.set(filePath, content);
      }
      for (const agent of applyPullBasedPreludeMarkdown(getGeminiAgents(language), language)) {
        files.set(`.gemini/agents/${agent.name}.md`, agent.content);
      }
      for (const [key, value] of collectSharedHooks(".gemini/hooks", "gemini")) {
        files.set(key, value);
      }
      files.set(
        ".gemini/settings.json",
        resolvePlaceholders(getGeminiSettings(language)),
      );
      return files;
    },
  },
};

export const PLATFORM_IDS = Object.keys(AI_TOOLS) as AITool[];
export const CONFIG_DIRS = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);
export const PLATFORM_MANAGED_DIRS = PLATFORM_IDS.flatMap((id) =>
  getManagedPaths(id),
);
export const ALL_MANAGED_DIRS = [
  DIR_NAMES.WORKFLOW,
  ...new Set(PLATFORM_MANAGED_DIRS),
];

const STATIC_MANAGED_ROOT_DIRS = ALL_MANAGED_DIRS.filter(
  (dir) => dir !== DIR_NAMES.WORKFLOW,
);

const RESERVED_NON_WORKFLOW_ROOT_DIRS = new Set([
  ...CONFIG_DIRS,
  ".agents",
  ".git",
  ".github",
  ".husky",
  ".idea",
  ".vscode",
  ".cursor",
  ".continue",
  ".copilot",
  ".kiro",
  ".opencode",
  ".qoder",
  ".windsurf",
]);

const WORKFLOW_ROOT_CHILD_DIRS = new Set([
  DIR_NAMES.SPEC,
  DIR_NAMES.TASKS,
  DIR_NAMES.WORKSPACE,
  DIR_NAMES.SCRIPTS,
]);
type WorkflowRootChildDir = typeof DIR_NAMES.SPEC
  | typeof DIR_NAMES.TASKS
  | typeof DIR_NAMES.WORKSPACE
  | typeof DIR_NAMES.SCRIPTS;

const WORKFLOW_ROOT_FILE_NAMES = new Set([
  FILE_NAMES.WORKFLOW_GUIDE,
  FILE_NAMES.PROJECT_OWNER,
  FILE_NAMES.CURRENT_TASK,
  "config.yaml",
  ".template-hashes.json",
]);

const WORKFLOW_ROOT_NAME_PATTERN = /^\.[a-z0-9][a-z0-9-]*$/i;

function isPersonalizedWorkflowRootName(dirName: string): boolean {
  return (
    !dirName.includes("/") &&
    WORKFLOW_ROOT_NAME_PATTERN.test(dirName) &&
    !RESERVED_NON_WORKFLOW_ROOT_DIRS.has(dirName)
  );
}

function looksLikeWorkflowRootPath(normalized: string): boolean {
  if (!normalized.startsWith(".") || normalized.includes("//")) {
    return false;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) {
    return false;
  }

  const [rootDir, childEntry] = parts;
  if (!isPersonalizedWorkflowRootName(rootDir)) {
    return false;
  }

  if (parts.length === 2) {
    return (
      WORKFLOW_ROOT_CHILD_DIRS.has(
        childEntry as WorkflowRootChildDir,
      ) || WORKFLOW_ROOT_FILE_NAMES.has(childEntry)
    );
  }

  return WORKFLOW_ROOT_CHILD_DIRS.has(
    childEntry as WorkflowRootChildDir,
  );
}

export function getConfiguredPlatforms(cwd: string): Set<AITool> {
  const platforms = new Set<AITool>();
  for (const id of PLATFORM_IDS) {
    if (fs.existsSync(path.join(cwd, AI_TOOLS[id].configDir))) {
      platforms.add(id);
    }
  }
  return platforms;
}

export function isManagedPath(dirPath: string): boolean {
  const normalized = dirPath.replace(/\\/g, "/");
  if (looksLikeWorkflowRootPath(normalized)) {
    return true;
  }
  return ALL_MANAGED_DIRS.some(
    (managed) => normalized.startsWith(`${managed}/`) || normalized === managed,
  );
}

export function isManagedRootDir(dirName: string): boolean {
  return (
    STATIC_MANAGED_ROOT_DIRS.includes(dirName) ||
    isPersonalizedWorkflowRootName(dirName)
  );
}

export function getPlatformManagedPaths(platformId: AITool): string[] {
  return getManagedPaths(platformId);
}

export function configurePlatform(
  platformId: AITool,
  cwd: string,
  language: TemplateLanguage = "en",
): Promise<void> {
  return PLATFORM_FUNCTIONS[platformId].configure(cwd, language);
}

export function collectPlatformTemplates(
  platformId: AITool,
  language: TemplateLanguage = "en",
): Map<string, string> | undefined {
  const map = PLATFORM_FUNCTIONS[platformId].collectTemplates?.(language);
  return map ? replaceInMap(map) : map;
}

export function getInitToolChoices(): {
  key: CliFlag;
  name: string;
  defaultChecked: boolean;
  platformId: AITool;
}[] {
  return PLATFORM_IDS.map((id) => ({
    key: AI_TOOLS[id].cliFlag,
    name: AI_TOOLS[id].name,
    defaultChecked: AI_TOOLS[id].defaultChecked,
    platformId: id,
  }));
}

export function resolveCliFlag(flag: string): AITool | undefined {
  return PLATFORM_IDS.find((id) => AI_TOOLS[id].cliFlag === flag);
}
