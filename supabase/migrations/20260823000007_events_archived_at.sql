-- WEB-BE-034 AC1: add events.archived_at, the column six call sites already use.
--
-- THE DECISION AC1 ASKS FOR, TAKEN. Option A (add the column) over Option B
-- (rewrite the call sites onto is_hidden), for three reasons:
--
--   1. It makes shipped code correct as written. Five functions filter
--      `.is("archived_at", null)` and agent-link-monitor WRITES it. Confirmed
--      42703 through the anon REST path, so all six have always failed:
--        agent-link-monitor:121   expired-event sweep      (select)
--        agent-link-monitor:144   the unpublish itself     (update)
--        agent-link-monitor:185   link-check sample        (select)
--        agent-lead-sourcing:112, agent-reengagement:80,
--        agent-weekly-digest:65                            (select)
--   2. THE TYPE IS THE POINT. is_hidden is a boolean; archived_at is a
--      timestamp, and the link-monitor's documented reversibility is "set
--      archived_at back to null to restore". Moving to is_hidden keeps the
--      on/off behaviour and loses WHEN it happened, which is exactly what makes
--      an automated unpublish auditable after the fact.
--   3. Additive per CLAUDE.md: ADD COLUMN ... NULL is always safe in a single
--      release, and no default means no table rewrite on 1,246 rows.
--
-- IT IS INERT TODAY, and that is deliberate. Every row is NULL, so
-- `.is("archived_at", null)` matches exactly the rows those five reads already
-- expected to see - nothing disappears from any surface. The only writer is
-- agent-link-monitor, which is one of the 62 undeployed functions (WEB-OPS-007).
--
-- SO THE BEHAVIOUR CHANGE LANDS ON DEPLOY, NOT HERE. The moment agent-link-
-- monitor runs, past events start being unpublished - which is the feature as
-- designed and documented in its header, but it is the first time it will ever
-- have happened. Whoever deploys the agent fleet should expect that, and can
-- undo any single one with `update events set archived_at = null where id = ...`.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.events.archived_at IS
  'When the event was unpublished by agent-link-monitor. NULL = live. '
  'Reversible: set back to NULL to restore. Distinct from is_hidden, which is '
  'a manual/editorial flag with no timestamp (WEB-BE-034).';

-- Every one of the six call sites filters on archived_at IS NULL alongside a
-- date bound, so the partial index matches the live-events question they ask.
CREATE INDEX IF NOT EXISTS idx_events_live_by_date
  ON public.events (date)
  WHERE archived_at IS NULL;
