/**
 * The ONLY PostCSS config (WEB-QUAL-009 AC3).
 *
 * There were two. postcss.config.cjs added cssnano under NODE_ENV=production -
 * and cssnano is not a dependency, so that config could never have loaded
 * without failing the build. It never did load: PostCSS searches .js before
 * .cjs, so this file won every time and the .cjs sat there as a trap for
 * whoever deleted this one.
 *
 * No minifier is configured because none is needed: Vite minifies CSS with
 * esbuild (build.cssMinify defaults to the esbuild path), which is why nobody
 * noticed the production config was dead.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
