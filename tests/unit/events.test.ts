import { describe, expect, it } from "vitest";
import { parseEvent, parseServerMessage } from "../../shared/events";
import { randomScenario, scriptedScenario } from "../../shared/scenario";
import { animationForStation, stationForTool } from "../../shared/toolMapping";
import { HookAdapter, summarize } from "../../server/hook-adapter";
import { AgentTracker } from "../../server/tracker";

describe("event contract (zod)", () => {
  it("accepts every event type", () => {
    for (const e of [
      { type: "agent_spawn", agentId: "a", kind: "claude" },
      { type: "agent_spawn", agentId: "b", parentId: "a", kind: "codex", label: "Explore" },
      { type: "agent_tool", agentId: "a", tool: "Read", summary: "x.ts" },
      { type: "agent_waiting", agentId: "a" },
      { type: "agent_done", agentId: "a" },
      { type: "agent_despawn", agentId: "a" },
    ]) expect(parseEvent(e)).toEqual(e);
  });

  it("rejects malformed events", () => {
    for (const e of [null, 42, {}, { type: "agent_tool", agentId: "a" }, { type: "agent_spawn", agentId: "", kind: "claude" }, { type: "nope", agentId: "a" }, { type: "agent_done" }])
      expect(parseEvent(e)).toBeNull();
  });

  it("parses snapshots as server messages", () => {
    const s = { type: "snapshot", agents: [{ spawn: { type: "agent_spawn", agentId: "a", kind: "claude" }, last: { type: "agent_done", agentId: "a" } }] };
    expect(parseServerMessage(s)).toEqual(s);
  });

  it("scenarios only produce valid events, in time order", () => {
    const scripted = scriptedScenario("m");
    for (const t of scripted) expect(parseEvent(t.event)).not.toBeNull();
    for (let i = 1; i < scripted.length; i++) expect(scripted[i]!.at).toBeGreaterThanOrEqual(scripted[i - 1]!.at);
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const it = randomScenario(rng);
    for (let i = 0; i < 300; i++) expect(parseEvent(it.next().value!.event)).not.toBeNull();
  });
});

describe("tool → station mapping", () => {
  it.each([
    ["Read", "library"],
    ["Grep", "library"],
    ["Glob", "library"],
    ["Edit", "desk"],
    ["Write", "desk"],
    ["Bash", "terminal"],
    ["Task", "whiteboard"],
    ["Agent", "whiteboard"],
    ["WebFetch", "window"],
    ["WebSearch", "window"],
    ["mcp__github__create_issue", "window"],
    ["SomethingNew", "desk"],
  ])("%s → %s", (tool, station) => expect(stationForTool(tool)).toBe(station));

  it("gives each station a work animation", () => {
    expect(animationForStation("library")).toBe("work_read");
    expect(animationForStation("terminal")).toBe("work_terminal");
    expect(animationForStation("unknown")).toBe("work_type");
  });
});

describe("hook adapter", () => {
  it("maps a Claude Code session with a sub-agent", () => {
    const h = new HookAdapter();
    const s = "sess-1";
    expect(h.handle({ hook_event_name: "PreToolUse", session_id: s, cwd: "/w/proj", tool_name: "Read", tool_input: { file_path: "/w/proj/a.ts" } })).toEqual([
      { type: "agent_spawn", agentId: s, kind: "claude", label: "proj" },
      { type: "agent_tool", agentId: s, tool: "Read", summary: "a.ts" },
    ]);
    const task = h.handle({ hook_event_name: "PreToolUse", session_id: s, tool_name: "Task", tool_use_id: "tu1", tool_input: { subagent_type: "Explore" } });
    expect(task).toContainEqual({ type: "agent_spawn", agentId: `${s}/tu1`, parentId: s, kind: "claude", label: "Explore" });
    expect(h.handle({ hook_event_name: "PreToolUse", session_id: s, agent_id: "tu1", tool_name: "Grep", tool_input: { pattern: "x" } })).toEqual([
      { type: "agent_tool", agentId: `${s}/tu1`, tool: "Grep", summary: "x" },
    ]);
    expect(h.handle({ hook_event_name: "Notification", session_id: s, message: "Claude needs permission" })).toEqual([
      { type: "agent_waiting", agentId: s, reason: "Claude needs permission" },
    ]);
    expect(h.handle({ hook_event_name: "SubagentStop", session_id: s })).toEqual([
      { type: "agent_done", agentId: `${s}/tu1` },
      { type: "agent_despawn", agentId: `${s}/tu1` },
    ]);
    expect(h.handle({ hook_event_name: "PostToolUse", session_id: s, tool_name: "Task", tool_use_id: "tu1" })).toEqual([]);
    expect(h.handle({ hook_event_name: "Stop", session_id: s })).toEqual([{ type: "agent_done", agentId: s }]);
    expect(h.handle({ hook_event_name: "SessionEnd", session_id: s })).toEqual([{ type: "agent_despawn", agentId: s }]);
  });

  it("passes AgentEvents through and ignores junk", () => {
    const h = new HookAdapter();
    expect(h.handle({ type: "agent_done", agentId: "x" })).toEqual([{ type: "agent_done", agentId: "x" }]);
    expect(h.handle("nope")).toEqual([]);
    expect(summarize({ command: "a".repeat(200) })!.length).toBeLessThanOrEqual(80);
  });
});

describe("server tracker", () => {
  it("keeps live agents with their last state for replay", () => {
    const t = new AgentTracker();
    t.apply({ type: "agent_spawn", agentId: "p", kind: "claude" });
    t.apply({ type: "agent_spawn", agentId: "c", parentId: "p", kind: "claude" });
    t.apply({ type: "agent_tool", agentId: "c", tool: "Read" });
    const snap = t.snapshot();
    expect(snap.agents.map((a) => a.spawn.agentId)).toEqual(["p", "c"]);
    expect(snap.agents[1]!.last).toEqual({ type: "agent_tool", agentId: "c", tool: "Read" });
    t.apply({ type: "agent_despawn", agentId: "p" });
    expect(t.ids()).toEqual([]);
  });
});
