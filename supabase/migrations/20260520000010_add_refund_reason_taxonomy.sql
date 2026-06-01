-- ADMIN-REFUND-001: structured refund_reason taxonomy + audit trail.
-- The existing `refunds.reason` column stays as a free-text field; the
-- new `refund_reason` column carries the chosen taxonomy bucket so
-- finance can report on why refunds happen.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS refund_reason TEXT
    CHECK (refund_reason IN (
      'duplicate_charge',
      'user_request',
      'campaign_cancelled',
      'fraud',
      'technical_issue',
      'content_takedown',
      'accidental_purchase',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS refund_reason_notes TEXT;

COMMENT ON COLUMN public.refunds.refund_reason IS
  'Taxonomy bucket. The free-text `reason` column is the long-form justification.';

-- Backfill pre-taxonomy rows.
UPDATE public.refunds
SET refund_reason = 'other',
    refund_reason_notes = COALESCE(refund_reason_notes, 'pre-taxonomy')
WHERE refund_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_refund_reason
  ON public.refunds(refund_reason);
