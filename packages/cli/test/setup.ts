// Strip host-shell session env vars so supported-platform context resolvers
// under test fall through to platform-input-derived keys instead of picking
// up whatever the developer's terminal happens to export.
delete process.env.HARNESS_CONTEXT_ID;
delete process.env.CLAUDE_SESSION_ID;
delete process.env.CLAUDE_CODE_SESSION_ID;
delete process.env.CODEX_SESSION_ID;
delete process.env.CODEX_THREAD_ID;
delete process.env.GEMINI_SESSION_ID;

// Strip *_PROJECT_DIR vars so a developer running tests inside a supported
// assistant session does not accidentally point hooks at the real repo.
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.GEMINI_PROJECT_DIR;
delete process.env.CODEX_PROJECT_DIR;
