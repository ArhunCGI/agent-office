// Adds / removes the Agent Office hooks in ~/.claude/settings.json, keeping every other hook.
//   node scripts/claude-hooks.mjs install [port]   (idempotent, writes a timestamped backup first)
//   node scripts/claude-hooks.mjs uninstall
//   node scripts/claude-hooks.mjs status
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILE = process.env.CLAUDE_SETTINGS ?? join(homedir(), ".claude", "settings.json");
const MARK = "# agent-office";
const [cmd = "status", port = "4317"] = process.argv.slice(2);
const command = `curl -s -m 1 -X POST http://localhost:${port}/hook -H 'content-type: application/json' --data-binary @- >/dev/null 2>&1 || true ${MARK}`;

/** Event → matcher (tool events need one; "*" = every tool). */
const EVENTS = {
  SessionStart: undefined,
  UserPromptSubmit: undefined,
  PreToolUse: "*",
  PostToolUse: "*",
  PostToolUseFailure: "*",
  PermissionRequest: "*",
  Notification: undefined,
  Stop: undefined,
  StopFailure: undefined,
  SubagentStart: undefined,
  SubagentStop: undefined,
  SessionEnd: undefined,
};

const settings = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
settings.hooks ??= {};
const ours = (group) => (group.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes(MARK));

function strip() {
  for (const [ev, groups] of Object.entries(settings.hooks)) {
    settings.hooks[ev] = groups.filter((g) => !ours(g));
    if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
  }
}

function save() {
  const backup = `${FILE}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (existsSync(FILE)) copyFileSync(FILE, backup);
  writeFileSync(FILE, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`saved ${FILE} (backup: ${backup})`);
}

if (cmd === "install") {
  strip();
  for (const [ev, matcher] of Object.entries(EVENTS)) {
    const group = { ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command, timeout: 3 }] };
    (settings.hooks[ev] ??= []).push(group);
  }
  save();
} else if (cmd === "uninstall") {
  strip();
  save();
} else {
  const on = Object.entries(settings.hooks).filter(([, groups]) => groups.some(ours)).map(([ev]) => ev);
  console.log(on.length ? `Agent Office hooks on: ${on.join(", ")}` : "Agent Office hooks not installed");
}
