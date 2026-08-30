/**
 * Parse a PostgREST select spec into the columns and embeds it names (XPLAT-013).
 *
 * Pure, so scripts/__tests__/mobile-select-columns.test.mjs can exercise it.
 * It exists as its own module for one reason: the naive version of this parser
 * produced a false positive on the FIRST real file it met, and the shape it got
 * wrong is common.
 *
 *     .select("status, platform, plan:subscription_plans(name)")
 *
 * `plan:subscription_plans(name)` is an EMBED - a joined row from another table
 * under an alias - not a column called subscription_plans. Splitting on ':' and
 * taking the last piece reports user_subscriptions.subscription_plans as a
 * missing column, which is both wrong and confidently phrased.
 *
 * What the syntax can carry, all of which has to survive:
 *     col                       a plain column
 *     alias:col                 renamed output, the COLUMN is the right half
 *     table(col, col)           an embed, columns belong to `table`
 *     alias:table(col)          an aliased embed, same
 *     table!fk(col)             an embed disambiguated by foreign key
 *     col::text                 a cast, the column is the left half
 *     *                         everything, checkable only against the model
 */

/**
 * Returns { columns, embeds, star }:
 *   columns  string[]                        columns of the table selected from
 *   embeds   Array<{table, columns}>         joined relations and their columns
 *   star     boolean                         a bare `*` is present, so column
 *                                            checking cannot apply
 *
 * Plain .mjs, not .ts, because check-mobile-schema-usage.mjs runs under bare
 * `node` in pr-checks.yml and cannot import a TypeScript module. Same reason
 * scripts/lib/pseoRouteClaims.mjs is .mjs while pseoShippable.ts is not.
 */

/**
 * Split on commas that are NOT inside parentheses, so an embed's own column list
 * stays with its embed. A plain `split(',')` tears `plan:t(a, b)` into two
 * fragments and loses the association.
 */
function splitTopLevel(spec) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of spec) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSelect(spec) {
  const columns = [];
  const embeds = [];
  let star = false;

  for (const part of splitTopLevel(spec)) {
    if (part === '*') {
      star = true;
      continue;
    }

    const open = part.indexOf('(');
    if (open !== -1 && part.endsWith(')')) {
      // An embed. The table is the head, minus any alias and any !fk hint.
      let head = part.slice(0, open).trim();
      const colon = head.indexOf(':');
      if (colon !== -1) head = head.slice(colon + 1).trim();
      const bang = head.indexOf('!');
      if (bang !== -1) head = head.slice(0, bang).trim();
      const inner = parseSelect(part.slice(open + 1, -1));
      embeds.push({ table: head, columns: inner.columns });
      // A nested embed's own embeds are relations of the inner table; hoist them
      // so the caller can check each against its own table.
      embeds.push(...inner.embeds);
      continue;
    }

    // A plain column, possibly aliased (alias:col) or cast (col::text).
    let name = part;
    const cast = name.indexOf('::');
    if (cast !== -1) name = name.slice(0, cast);
    const colon = name.indexOf(':');
    if (colon !== -1) name = name.slice(colon + 1);
    name = name.trim();
    if (name === '*') {
      star = true;
      continue;
    }
    // Anything that is not a bare identifier - a json path, a function call, a
    // string that got here by accident - is skipped rather than guessed at.
    if (/^[a-z_][a-z0-9_]*$/.test(name)) columns.push(name);
  }

  return { columns, embeds, star };
}
