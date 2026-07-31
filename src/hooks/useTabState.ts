import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-synced tab state (WEB-UX-008).
 *
 * Local `useState` loses the selected tab whenever the page remounts — a
 * session refresh, a route re-render, a hard reload, or simply navigating away
 * and coming back all drop the user on the first tab, which is jarring when
 * they were working several tabs deep. Keeping the selection in the query
 * string makes it survive all of those, and makes the view linkable.
 *
 * The default tab is omitted from the URL so links stay clean, and only the
 * search string changes, so this never triggers the route-change scroll reset.
 *
 * ```tsx
 * const [activeTab, setActiveTab] = useTabState("overview");
 * <Tabs value={activeTab} onValueChange={setActiveTab}>…</Tabs>
 * ```
 */
export interface TabStateOptions {
  /**
   * Query-string key. Defaults to `tab`. Give each tab strip on a route its
   * own key so nested tab groups don't overwrite each other.
   */
  param?: string;
  /**
   * Allowed tab ids. An unrecognised value in the URL (stale link, typo,
   * renamed tab) falls back to the default instead of rendering nothing.
   */
  validTabs?: readonly string[];
  /**
   * Push a history entry per tab change so Back steps through tabs. Defaults
   * to false — replacing keeps Back meaning "the previous page".
   */
  push?: boolean;
}

export function useTabState(
  defaultTab: string,
  options: TabStateOptions = {},
): [string, (tab: string) => void] {
  const { param = "tab", validTabs, push = false } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const fromUrl = searchParams.get(param);
  const activeTab =
    fromUrl && (!validTabs || validTabs.includes(fromUrl)) ? fromUrl : defaultTab;

  const setActiveTab = useCallback(
    (tab: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!tab || tab === defaultTab) next.delete(param);
          else next.set(param, tab);
          return next;
        },
        { replace: !push },
      );
    },
    [setSearchParams, param, defaultTab, push],
  );

  return [activeTab, setActiveTab];
}
