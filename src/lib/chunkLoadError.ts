/**
 * A stale lazy chunk after a deploy. React.lazy caches the rejected import, so
 * re-rendering cannot recover; only a reload fetches the new chunk names.
 */
export function isChunkLoadError(error?: Error): boolean {
  if (!error) return false;
  return /Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    `${error.name} ${error.message}`,
  );
}
