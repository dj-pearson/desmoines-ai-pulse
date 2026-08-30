-- WEB-QA-017: the admin Content Queue has never loaded.
--
-- src/components/cms/ContentQueue.tsx:129 orders by `priority`, and the column
-- has never existed. Confirmed against production:
--   GET /rest/v1/content_queue?order=priority.desc
--   -> 42703 "column content_queue.priority does not exist"
-- loadQueueItems throws, the catch shows "Failed to load content queue", and the
-- reviewer sees an empty screen. handlePriorityChange writes the same column, so
-- the priority selector fails too.
--
-- ADDING THE COLUMN RATHER THAN REMOVING THE FEATURE. The UI is fully specified
-- around it and leaves no ambiguity about the shape: `priority: number` in the
-- item interface, and priorityLabels maps the integers 1-10 to Low / Normal /
-- High / Urgent / Critical. Stripping that out would be inventing a different
-- product; adding the column makes shipped code correct as written.
--
-- Additive per CLAUDE.md. content_queue holds 0 rows, so the constant default
-- costs no rewrite, and NOT NULL matches the non-optional `priority: number` the
-- component already declares - a nullable column would put `undefined` through
-- priorityLabels and render nothing.
--
-- 5 is the default because priorityLabels maps 3-5 to "Normal": a new submission
-- arrives at the middle of the band rather than at an edge.

ALTER TABLE public.content_queue
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 5;

-- NO CHECK CONSTRAINT, deliberately. A BETWEEN 1 AND 10 range would match the
-- priorityLabels map exactly, and scripts/check-migration-safety.mjs flags any
-- ADD CONSTRAINT ... CHECK as a tightening that can reject values old clients
-- send. That rule is a regex over the file, so it cannot tell that this CHECK
-- would sit on a column created three lines above it and therefore has no old
-- client to reject.
--
-- The rule is right about the shape and the fix is not to override it. A gate
-- that gets waved through once gets waved through by habit, and the constraint
-- was worth very little here: the only writer is an admin selector that offers
-- 1-10 and nothing else. Teaching the checker to recognise "CHECK on a column
-- added in the same migration" is the real fix and belongs in its own change,
-- not smuggled into a column addition.

-- The queue is read in priority order and then by submission time, which is
-- exactly the index the component's two .order() calls want.
CREATE INDEX IF NOT EXISTS idx_content_queue_priority_submitted
  ON public.content_queue (priority DESC, submitted_at ASC);
