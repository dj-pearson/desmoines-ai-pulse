/**
 * The React Router v7 behaviours this app opts into on 6.30 (WEB-QUAL-017).
 *
 * Router 7 makes both of these the only behaviour. Opting in on 6.x means the
 * major bump changes no runtime behaviour on its own, so if something breaks
 * after it, the bump is not the suspect; and it silences the two "React Router
 * Future Flag Warning" lines every dev page load printed.
 *
 * v7_startTransition: navigation state updates run inside React.startTransition.
 *   A route whose lazy chunk has not loaded keeps the current page on screen
 *   where a Suspense boundary already showed it, instead of swapping it for the
 *   fallback.
 * v7_relativeSplatPath: a relative path inside a splat route resolves against
 *   the whole matched URL, not the route's parent. The only splat route here is
 *   the `*` NotFound, whose links are all absolute, so nothing moves today; the
 *   flag decides how any future one behaves.
 *
 * The data-router flags (v7_fetcherPersist, v7_normalizeFormMethod,
 * v7_partialHydration, v7_skipActionErrorRevalidation) do not apply: the app
 * uses <BrowserRouter>, not createBrowserRouter.
 */
export const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
