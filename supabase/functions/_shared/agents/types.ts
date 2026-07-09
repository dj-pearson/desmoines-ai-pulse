/**
 * Agent module contract for the consolidated `agent-runner` dispatcher
 * (AOS edge-function consolidation).
 *
 * Each cron/agent that previously shipped as its own edge function
 * (`agent-<name>/index.ts` calling `runAgent(AGENT_KEY, ctx => …)`) is now a
 * module here exporting `run(ctx, env)` — exactly the old `runAgent` callback
 * body plus that function's local helpers. All the identical boilerplate (CORS,
 * `requireAdminOrApiKey`, service-role client, `runAgent` ledger wrapper, JSON
 * response shaping) lives once in `agent-runner/index.ts`.
 *
 * The dispatcher reads the request body once (to resolve which agent to run) and
 * passes the parsed object as `env.body`, so modules must read manual-trigger
 * params from `env.body` — NOT `req.json()` (the body stream is already
 * consumed).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AgentRunContext } from "../agentRun.ts";

export type { AgentRunContext } from "../agentRun.ts";

export interface AgentRunEnv {
  /** Service-role client (RLS-bypassing), built once by the dispatcher. */
  supabase: SupabaseClient;
  /** The original request — headers/method are usable; the body is consumed. */
  req: Request;
  /** Parsed request body ({} when absent/invalid) for manual-trigger params. */
  body: Record<string, unknown>;
}

/** A consolidated agent: the former `runAgent(KEY, fn)` callback `fn`. */
export type AgentRun = (ctx: AgentRunContext, env: AgentRunEnv) => Promise<unknown>;
