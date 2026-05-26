/**
 * Shared hook templates — platform-independent runtime hook scripts.
 *
 * These scripts read workflow state from the personalized workflow root
 * (for example `.alice/`) after placeholder resolution and can be written
 * to any supported platform's hooks directory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

const RUNTIME_HOOK_FILES = [
  "inject-subagent-context.js",
  "inject-workflow-state.js",
  "session-start.js",
] as const;

export interface HookScript {
  /** Runtime filename (for example "session-start.js") */
  name: string;
  /** Script content — no placeholders, ready to write directly */
  content: string;
}

export type SharedHookName =
  | "session-start.js"
  | "inject-workflow-state.js"
  | "inject-subagent-context.js";

export type SharedHookPlatform = "claude" | "codex" | "gemini";

/**
 * Which shared hooks each platform actually invokes. Single source of truth
 * for shared-hook distribution — both runtime install and update diffing
 * read from this table.
 *
 * Routing rules encoded here:
 * - `session-start.js` — used by Claude Code and Gemini CLI.
 * - `inject-workflow-state.js` — used by all supported platforms.
 * - `inject-subagent-context.js` — used only by Claude Code in the current
 *   supported set because Codex and Gemini load sub-agent context via prelude.
 */
export const SHARED_HOOKS_BY_PLATFORM: Record<
  SharedHookPlatform,
  readonly SharedHookName[]
> = {
  claude: [
    "session-start.js",
    "inject-workflow-state.js",
    "inject-subagent-context.js",
  ],
  codex: ["inject-workflow-state.js"],
  gemini: ["session-start.js", "inject-workflow-state.js"],
};

/**
 * Get all shared hook scripts. Content is platform-independent and can be
 * written directly without placeholder resolution.
 */
export function getSharedHookScripts(): HookScript[] {
  const scripts: HookScript[] = [];
  const files = readdirSync(__dirname)
    .filter((f) => (RUNTIME_HOOK_FILES as readonly string[]).includes(f))
    .sort();

  for (const file of files) {
    scripts.push({ name: file, content: readTemplate(file) });
  }

  return scripts;
}

/**
 * Get the shared hook scripts that a given platform actually registers.
 * Drives both `writeSharedHooks` and `collectSharedHooks` so distribution
 * never drifts from the per-platform capability declared above.
 */
export function getSharedHookScriptsForPlatform(
  platform: SharedHookPlatform,
): HookScript[] {
  const allowed = new Set<string>(SHARED_HOOKS_BY_PLATFORM[platform]);
  return getSharedHookScripts().filter((h) => allowed.has(h.name));
}
