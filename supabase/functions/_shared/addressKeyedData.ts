/**
 * Personal data keyed by email address, for account export and erasure
 * (WEB-FEAT-095).
 *
 * PURGE_TABLES and RETAINED_TABLES in userDataTables.ts are keyed by user_id,
 * and the test that keeps them complete reads user_id columns out of types.ts.
 * Mail data is not keyed that way. Every outbound email writes an email_log row
 * with the lowercased address in to_email, user_id is often null (newsletter
 * sends) and the column is ON DELETE SET NULL, so erasing the auth user used to
 * leave every send ever made to the address in place with only the user_id
 * blanked. email_log is also absent from the generated types, so the user_id
 * drift test could not see it. newsletter_subscribers was deleted by an inline
 * call in delete-user-account and never exported, though it holds the signup
 * IP, user agent and UTM source. email_suppressions was in neither path.
 *
 * Both rights now walk this one list: export-user-data reads every entry,
 * delete-user-account deletes the "purge" ones.
 *
 * The client is a parameter, so both walks are tested against a fake
 * (_tests/address-keyed-data.test.ts).
 */

export interface AddressKeyedTable {
  /** Column holding the lowercased address. */
  emailColumn: string;
  /**
   * Also matched on this column when present: a row sent while the account had
   * an older address still names the user here.
   */
  userIdColumn?: string;
  erasure: "purge" | "retain";
  /** Why an entry is kept on erasure. Shown to the user in the export. */
  basis?: string;
}

export const ADDRESS_KEYED_TABLES: Readonly<Record<string, AddressKeyedTable>> = {
  newsletter_subscribers: { emailColumn: "email", erasure: "purge" },
  email_log: { emailColumn: "to_email", userIdColumn: "user_id", erasure: "purge" },
  email_suppressions: {
    emailColumn: "email",
    erasure: "retain",
    basis:
      "The bounce, complaint or unsubscribe record for the address. Kept so mail stops for good: " +
      "deleting it would let the address be mailed again if anyone re-entered it.",
  },
};

export interface TableFailure {
  table: string;
  code?: string;
  message: string;
}

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

/** The slice of a PostgREST filter builder this needs. */
export interface Filtered<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: string): Filtered<T>;
}

/** The slice of the Supabase client this needs. Narrow on purpose. */
export interface AddressDataClient {
  from(table: string): {
    select(columns: string): Filtered<Record<string, unknown>[]>;
    delete(): Filtered<unknown>;
  };
}

/** The same normalization _shared/email.ts applies before writing to_email. */
export function normalizeAddress(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Each filter an entry is matched on, for this user. */
function filtersFor(
  entry: AddressKeyedTable,
  userId: string,
  address: string | null,
): [string, string][] {
  const filters: [string, string][] = [];
  if (address) filters.push([entry.emailColumn, address]);
  if (entry.userIdColumn) filters.push([entry.userIdColumn, userId]);
  return filters;
}

function rowKey(row: Record<string, unknown>): string {
  return typeof row.id === "string" || typeof row.id === "number"
    ? `id:${row.id}`
    : JSON.stringify(row);
}

/**
 * Every address-keyed row for the export. A row matched by both the address and
 * the user id appears once. A table that errors is reported, not dropped.
 */
export async function readAddressKeyedData(
  client: AddressDataClient,
  userId: string,
  email: string | null | undefined,
): Promise<{ data: Record<string, unknown[]>; unavailable: TableFailure[] }> {
  const address = normalizeAddress(email);
  const data: Record<string, unknown[]> = {};
  const unavailable: TableFailure[] = [];

  for (const [table, entry] of Object.entries(ADDRESS_KEYED_TABLES)) {
    const seen = new Map<string, Record<string, unknown>>();
    let failed = false;
    for (const [column, value] of filtersFor(entry, userId, address)) {
      const { data: rows, error } = await client.from(table).select("*").eq(column, value);
      if (error) {
        unavailable.push({ table, code: error.code, message: error.message });
        failed = true;
        break;
      }
      for (const row of rows ?? []) seen.set(rowKey(row), row);
    }
    if (!failed && seen.size > 0) data[table] = [...seen.values()];
  }

  return { data, unavailable };
}

/**
 * Delete the "purge" entries for this user. Keeps going past a failure so the
 * erasure is never left half-done, and returns every failure so the caller can
 * report an incomplete erasure instead of a clean one.
 */
export async function purgeAddressKeyedData(
  client: AddressDataClient,
  userId: string,
  email: string | null | undefined,
): Promise<{ attempted: number; failures: TableFailure[] }> {
  const address = normalizeAddress(email);
  const failures: TableFailure[] = [];
  let attempted = 0;

  for (const [table, entry] of Object.entries(ADDRESS_KEYED_TABLES)) {
    if (entry.erasure !== "purge") continue;
    for (const [column, value] of filtersFor(entry, userId, address)) {
      attempted++;
      const { error } = await client.from(table).delete().eq(column, value);
      if (error) failures.push({ table, code: error.code, message: error.message });
    }
  }

  return { attempted, failures };
}

/** The stated basis for each retained entry, for the export's retentionBasis. */
export function addressRetentionBasis(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [table, entry] of Object.entries(ADDRESS_KEYED_TABLES)) {
    if (entry.erasure === "retain" && entry.basis) out[table] = entry.basis;
  }
  return out;
}
