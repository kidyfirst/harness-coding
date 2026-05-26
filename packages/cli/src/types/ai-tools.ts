/**
 * AI Tool Types and Registry
 *
 * First release of harness-spec supports only Claude Code, Codex, and Gemini.
 */

export type AITool = "claude-code" | "codex" | "gemini";

export type TemplateDir = "common" | "claude" | "codex" | "gemini";

export type CliFlag = "claude" | "codex" | "gemini";

export interface TemplateContext {
  cmdRefPrefix: "/harness-spec:" | "$";
  executorAI: "Bash scripts or Task calls" | "Bash scripts or tool calls";
  userActionLabel: "Slash commands" | "Skills";
  agentCapable: boolean;
  hasHooks: boolean;
  cliFlag: CliFlag;
}

export interface AIToolConfig {
  name: string;
  templateDirs: TemplateDir[];
  configDir: string;
  supportsAgentSkills?: boolean;
  extraManagedPaths?: string[];
  cliFlag: CliFlag;
  defaultChecked: boolean;
  templateContext: TemplateContext;
}

export const AI_TOOLS: Record<AITool, AIToolConfig> = {
  "claude-code": {
    name: "Claude Code",
    templateDirs: ["common", "claude"],
    configDir: ".claude",
    cliFlag: "claude",
    defaultChecked: true,
    templateContext: {
      cmdRefPrefix: "/harness-spec:",
      executorAI: "Bash scripts or Task calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "claude",
    },
  },
  codex: {
    name: "Codex",
    templateDirs: ["common", "codex"],
    configDir: ".codex",
    supportsAgentSkills: true,
    cliFlag: "codex",
    defaultChecked: false,
    templateContext: {
      cmdRefPrefix: "$",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: false,
      cliFlag: "codex",
    },
  },
  gemini: {
    name: "Gemini CLI",
    templateDirs: ["common", "gemini"],
    configDir: ".gemini",
    supportsAgentSkills: true,
    cliFlag: "gemini",
    defaultChecked: false,
    templateContext: {
      cmdRefPrefix: "/harness-spec:",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "gemini",
    },
  },
};

export function getToolConfig(tool: AITool): AIToolConfig {
  return AI_TOOLS[tool];
}

export function getManagedPaths(tool: AITool): string[] {
  const config = AI_TOOLS[tool];
  const paths = [config.configDir];
  if (config.supportsAgentSkills) {
    paths.push(".agents/skills");
  }
  if (config.extraManagedPaths) {
    paths.push(...config.extraManagedPaths);
  }
  return paths;
}

export function getTemplateDirs(tool: AITool): TemplateDir[] {
  return AI_TOOLS[tool].templateDirs;
}
