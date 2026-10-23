import type { AgentEvent } from "../shared/events";
import { play, randomScenario, scriptedScenario, stressScenario } from "../shared/scenario";

/**
 * Event simulator: POSTs AgentEvents to a running server.
 *   pnpm sim                → scripted session, then exits
 *   pnpm sim --random       → endless random sessions
 *   pnpm sim --stress 30    → one parent + 30 busy sub-agents
 *   options: --speed 2  --url http://localhost:4317
 */
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : fallback;
};
const base = opt("--url", `http://localhost:${process.env.PORT ?? 4317}`);
const speed = Number(opt("--speed", "1"));

async function emit(e: AgentEvent): Promise<void> {
  try {
    const r = await fetch(`${base}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e) });
    console.log(`${new Date().toISOString().slice(11, 19)} ${r.status} ${e.type.padEnd(13)} ${e.agentId}${"tool" in e ? ` ${e.tool}` : ""}`);
  } catch {
    console.error(`server unreachable at ${base} — start it with \`pnpm dev\``);
    process.exit(1);
  }
}

const send = (e: AgentEvent) => void emit(e);
if (args.includes("--stress")) play(stressScenario(Number(opt("--stress", "30"))), send, { speed });
else if (args.includes("--random")) play(randomScenario(Math.random, ["claude", "claude", "robot"]), send, { speed });
else {
  const id = `sim-${Date.now().toString(36)}`;
  const events = scriptedScenario(id);
  play(events, send, { speed });
  setTimeout(() => process.exit(0), ((events[events.length - 1]?.at ?? 0) * 1000) / speed + 1000);
}
