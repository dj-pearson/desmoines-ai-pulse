/**
 * SECURITY: verify_jwt is not relied on; the handler authenticates the caller
 *   itself with supabase.auth.getUser(token) and exports ONLY that user's rows.
 *   It runs with the service role because a right-to-access export has to reach
 *   tables RLS hides from the user, so every query is scoped by user_id in code
 *   and there is no path that takes an id from the request.
 * Risk level: HIGH by nature - it returns personal data - which is why the
 *   scoping is the first thing to check in review.
 *
 * export-user-data (XPLAT-007 / WEB-LEGAL-004) - right of access, GDPR Art. 15.
 *
 * WHY THIS EXISTS. The export was client-side in PrivacyControls.tsx, looping a
 * hardcoded list of EIGHT tables - three of which (favorites, ratings, reviews)
 * do not exist in this database and return 42P01. So it read five real tables,
 * failed silently on the other three because "an error on one table doesn't
 * block the whole export", and handed the user a document stating "This export
 * contains personal data we hold about your account".
 *
 * Meanwhile the ERASURE path deletes from 62 tables. The two rights disagreed by
 * 57 tables, and only one of them was maintained.
 *
 * SOURCED FROM PURGE_TABLES, WHICH IS THE POINT. Access and erasure now read the
 * same list, so they cannot drift, and user-data-tables.test.ts - which already
 * fails when a table with a user_id column is in neither list - starts
 * protecting the export too. Adding a feature that stores user data now updates
 * both rights at once or fails a test.
 *
 * RETAINED TABLES ARE INCLUDED, deliberately. RETAINED_TABLES holds rows we
 * decline to delete and each entry carries the basis for keeping it. A right of
 * access is not a right of erasure: the user is entitled to see what we hold
 * MORE clearly for the data we intend to keep, not less. Each retained table is
 * exported alongside the reason it is retained.
 *
 * A MISSING TABLE IS REPORTED, NOT SWALLOWED. Every table that errors is listed
 * in `unavailable` with its code, so the export says what it could not read
 * instead of quietly shrinking - which is exactly how the client-side version
 * came to omit three tables nobody noticed for months.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { PURGE_TABLES, RETAINED_TABLES } from "../_shared/userDataTables.ts";

interface TableFailure {
  table: string;
  code?: string;
  message: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);

    // The ONLY id used anywhere below. Nothing is read from the request body,
    // so there is no shape of request that exports someone else's data.
    const userId = user.id;

    const data: Record<string, unknown[]> = {};
    const unavailable: TableFailure[] = [];
    const retainedTables = Object.keys(RETAINED_TABLES);

    for (const table of [...PURGE_TABLES, ...retainedTables]) {
      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", userId);

      if (error) {
        unavailable.push({ table, code: error.code, message: error.message });
        continue;
      }
      // Only tables with something in them, so the document is readable. The
      // full list of tables considered is reported separately below, so an
      // absent key means "nothing here", not "not looked at".
      if (rows && rows.length > 0) data[table] = rows;
    }

    return json({
      exportedAt: new Date().toISOString(),
      userId,
      email: user.email ?? null,
      data,
      // What was looked at, so the reader can tell an empty table from an
      // unexamined one.
      tablesConsidered: PURGE_TABLES.length + retainedTables.length,
      tablesWithData: Object.keys(data).length,
      // Rows kept even if erasure is requested, each with the basis. A user
      // reading their own export is entitled to know which of it we would not
      // delete, and why.
      retentionBasis: RETAINED_TABLES,
      // Empty on a healthy database. Anything here is a table this export could
      // not read - a schema change, a permission problem, or a name that no
      // longer exists.
      unavailable,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Export failed" },
      500,
    );
  }
});
