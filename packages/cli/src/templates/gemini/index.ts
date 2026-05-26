/**
 * Gemini CLI templates
 *
 * Directory structure:
 *   gemini/
 *   ├── agents/        # Sub-agent definitions
 *   └── settings.json  # Settings configuration
 */

import type { TemplateLanguage } from "../../commands/init.js";
import { createTemplateReader, type AgentTemplate } from "../template-utils.js";
export type { AgentTemplate };

const { listMdAgents, getConfig } = createTemplateReader(import.meta.url);

export const getAllAgents = (
  language: TemplateLanguage = "en",
): AgentTemplate[] => listMdAgents("agents", language);
export const getSettingsTemplate = (
  language: TemplateLanguage = "en",
): string => getConfig("settings.json", language);
