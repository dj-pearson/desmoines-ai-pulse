-- AOS-PROSPECT-002 prerequisite: add the 'sales' role to the user_role enum.
--
-- crm_pipeline (AOS-PROSPECT-002) gates its RLS on a 'sales' role via
-- is_admin_or_sales(), but the value was never added to the enum, so the
-- CREATE FUNCTION that casts 'sales'::user_role failed. Adding an enum value is
-- additive-safe per CLAUDE.md. It MUST land in its own migration (committed
-- before any migration uses it) because Postgres forbids using a newly added
-- enum value within the same transaction that adds it.
--
-- Placement note: the role hierarchy in user_has_role_or_higher() is an explicit
-- CASE map, not enum sort order, so appending 'sales' (which falls into the
-- lowest ELSE bucket there) does NOT grant admin-or-higher access. CRM access is
-- granted only by is_admin_or_sales()'s direct membership check.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales';
