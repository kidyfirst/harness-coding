/**
 * Markdown templates for Harness Spec workflow
 *
 * These are GENERIC templates for new projects.
 * Structure templates use .md.txt extension as they are generic templates.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateLanguage } from "../../commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a template file from src/templates/markdown/
 */
function readLocalTemplate(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

function buildLanguagePath(
  filename: string,
  language: TemplateLanguage,
): string {
  const lastSlash = filename.lastIndexOf("/");
  if (lastSlash === -1) {
    return `${language}/${filename}`;
  }
  const dir = filename.slice(0, lastSlash);
  const file = filename.slice(lastSlash + 1);
  return `${dir}/${language}/${file}`;
}

function readLocalizedTemplate(
  filename: string,
  language: TemplateLanguage,
): string {
  const localizedFilename = buildLanguagePath(filename, language);
  try {
    return readLocalTemplate(localizedFilename);
  } catch {
    if (language !== "en") {
      try {
        return readLocalTemplate(buildLanguagePath(filename, "en"));
      } catch {
        return readLocalTemplate(filename);
      }
    }
    return readLocalTemplate(filename);
  }
}

function replaceAll(content: string, searchValue: string, replaceValue: string): string {
  return content.split(searchValue).join(replaceValue);
}

// =============================================================================
// Root files for new projects
// =============================================================================

const agentsMdTemplate: string = readLocalizedTemplate("agents.md", "en");

export function renderAgentsMdContent(
  workflowRoot: string,
  language: TemplateLanguage = "en",
): string {
  return replaceAll(
    readLocalizedTemplate("agents.md", language),
    "{{WORKFLOW_ROOT}}",
    workflowRoot,
  );
}

export const agentsMdContent: string = renderAgentsMdContent(".harness-spec");

// Workspace index template (project-ownership work records)
export const workspaceIndexContent: string =
  readLocalizedTemplate("workspace-index.md", "en");

// Backwards compatibility alias
export const agentProgressIndexContent = workspaceIndexContent;

// Gitignore (template file - .gitignore is ignored by npm)
export const workflowGitignoreContent: string =
  readLocalTemplate("gitignore.txt");

// =============================================================================
// Structure templates (generic templates from .txt files)
// These are NOT dogfooded - they are generic templates for new projects
// =============================================================================

// Backend structure (multi-doc format)
export const backendIndexContent: string = readLocalizedTemplate(
  "spec/backend/index.md.txt",
  "en",
);
export const backendDirectoryStructureContent: string = readLocalizedTemplate(
  "spec/backend/directory-structure.md.txt",
  "en",
);
export const backendDatabaseGuidelinesContent: string = readLocalizedTemplate(
  "spec/backend/database-guidelines.md.txt",
  "en",
);
export const backendLoggingGuidelinesContent: string = readLocalizedTemplate(
  "spec/backend/logging-guidelines.md.txt",
  "en",
);
export const backendQualityGuidelinesContent: string = readLocalizedTemplate(
  "spec/backend/quality-guidelines.md.txt",
  "en",
);
export const backendErrorHandlingContent: string = readLocalizedTemplate(
  "spec/backend/error-handling.md.txt",
  "en",
);

// Frontend structure (multi-doc format)
export const frontendIndexContent: string = readLocalizedTemplate(
  "spec/frontend/index.md.txt",
  "en",
);
export const frontendDirectoryStructureContent: string = readLocalizedTemplate(
  "spec/frontend/directory-structure.md.txt",
  "en",
);
export const frontendTypeSafetyContent: string = readLocalizedTemplate(
  "spec/frontend/type-safety.md.txt",
  "en",
);
export const frontendHookGuidelinesContent: string = readLocalizedTemplate(
  "spec/frontend/hook-guidelines.md.txt",
  "en",
);
export const frontendComponentGuidelinesContent: string = readLocalizedTemplate(
  "spec/frontend/component-guidelines.md.txt",
  "en",
);
export const frontendQualityGuidelinesContent: string = readLocalizedTemplate(
  "spec/frontend/quality-guidelines.md.txt",
  "en",
);
export const frontendStateManagementContent: string = readLocalizedTemplate(
  "spec/frontend/state-management.md.txt",
  "en",
);

// Guides structure
export const guidesIndexContent: string = readLocalizedTemplate(
  "spec/guides/index.md.txt",
  "en",
);
export const guidesCrossLayerThinkingGuideContent: string = readLocalizedTemplate(
  "spec/guides/cross-layer-thinking-guide.md.txt",
  "en",
);
export const guidesCodeReuseThinkingGuideContent: string = readLocalizedTemplate(
  "spec/guides/code-reuse-thinking-guide.md.txt",
  "en",
);

function readLocalizedDocTemplate(
  basePath: string,
  language: TemplateLanguage,
): string {
  return readLocalizedTemplate(basePath, language);
}

export function getAgentProgressIndexContent(
  language: TemplateLanguage,
): string {
  return readLocalizedTemplate("workspace-index.md", language);
}

export function getBackendDocs(language: TemplateLanguage) {
  return [
    {
      name: "index.md",
      content: readLocalizedDocTemplate("spec/backend/index.md.txt", language),
    },
    {
      name: "directory-structure.md",
      content: readLocalizedTemplate(
        "spec/backend/directory-structure.md.txt",
        language,
      ),
    },
    {
      name: "database-guidelines.md",
      content: readLocalizedTemplate(
        "spec/backend/database-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "logging-guidelines.md",
      content: readLocalizedTemplate(
        "spec/backend/logging-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "quality-guidelines.md",
      content: readLocalizedTemplate(
        "spec/backend/quality-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "error-handling.md",
      content: readLocalizedTemplate(
        "spec/backend/error-handling.md.txt",
        language,
      ),
    },
  ];
}

export function getFrontendDocs(language: TemplateLanguage) {
  return [
    {
      name: "index.md",
      content: readLocalizedDocTemplate("spec/frontend/index.md.txt", language),
    },
    {
      name: "directory-structure.md",
      content: readLocalizedTemplate(
        "spec/frontend/directory-structure.md.txt",
        language,
      ),
    },
    {
      name: "type-safety.md",
      content: readLocalizedTemplate(
        "spec/frontend/type-safety.md.txt",
        language,
      ),
    },
    {
      name: "hook-guidelines.md",
      content: readLocalizedTemplate(
        "spec/frontend/hook-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "component-guidelines.md",
      content: readLocalizedTemplate(
        "spec/frontend/component-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "quality-guidelines.md",
      content: readLocalizedTemplate(
        "spec/frontend/quality-guidelines.md.txt",
        language,
      ),
    },
    {
      name: "state-management.md",
      content: readLocalizedTemplate(
        "spec/frontend/state-management.md.txt",
        language,
      ),
    },
  ];
}

export function getGuidesDocs(language: TemplateLanguage) {
  return [
    {
      name: "index.md",
      content: readLocalizedDocTemplate("spec/guides/index.md.txt", language),
    },
    {
      name: "cross-layer-thinking-guide.md",
      content: readLocalizedTemplate(
        "spec/guides/cross-layer-thinking-guide.md.txt",
        language,
      ),
    },
    {
      name: "code-reuse-thinking-guide.md",
      content: readLocalizedTemplate(
        "spec/guides/code-reuse-thinking-guide.md.txt",
        language,
      ),
    },
  ];
}
