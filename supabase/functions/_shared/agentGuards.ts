/**
 * agentGuards — the global + per-agent pause check honored by every agent
 * entrypoint (AOS-CORE-009).
 *
 * An agent is paused when EITHER the global kill switch (`aos_kill_switch`
 * feature flag) is on, OR its own `agent_registry.enabled` is false. The shared
 * run wrappers (jobRunner.runJob, agentRun.runAgent) call `agentPaused` before
 * doing any work and record a SKIPPED run instead — so a misbehaving agent can
 * be stopped instantly, without a deploy, and the gap is visible in the ledger.
 *
 * FAIL-OPEN: a read error here must never silently halt automation. We only
 * report `paused` when a switch is DEFINITIVELY set; any error → not paused.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

export const KILL_SWITCH_FLAG = "aos_kill_switch";

let killCache: { at: number; on: boolean } | null = null;
const KILL_TTL_MS = 15_000; // short so an incident pause takes effect within ~15s

/** True when the global kill switch is on. Fail-open (false) on any read error. */
export async function globalKillOn(supabase: Client): Promise<boolean> {
  if (killCache && Date.now() - killCache.at < KILL_TTL_MS) return killCache.on;
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("flag_key", KILL_SWITCH_FLAG)
      .maybeSingle();
    if (error) throw error;
    const on = data?.enabled === true;
    killCache = { at: Date.now(), on };
    return on;
  } catch (err) {
    console.warn("[agentGuards] kill-switch read failed (treating as OFF):", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export interface PauseResult {
  paused: boolean;
  reason?: "global_kill_switch" | "agent_disabled";
}

/**
 * Is this agent paused right now? Checks the global kill switch first, then the
 * per-agent enabled flag. `agentKey` may be any job/agent name — an unregistered
 * name is only affected by the global switch.
 */
export async function agentPaused(supabase: Client, agentKey: string): Promise<PauseResult> {
  if (await globalKillOn(supabase)) return { paused: true, reason: "global_kill_switch" };

  try {
    const { data, error } = await supabase
      .from("agent_registry")
      .select("enabled")
      .eq("agent_key", agentKey)
      .maybeSingle();
    if (error) throw error;
    // Only a registered, explicitly-disabled agent is paused. Unregistered
    // job names (data == null) run — they're covered by the global switch only.
    if (data && data.enabled === false) return { paused: true, reason: "agent_disabled" };
    return { paused: false };
  } catch (err) {
    console.warn("[agentGuards] per-agent enabled read failed (treating as active):", err instanceof Error ? err.message : String(err));
    return { paused: false };
  }
}

/** Clear the kill-switch cache (test/debug helper). */
export function clearGuardCache(): void {
  killCache = null;
}
