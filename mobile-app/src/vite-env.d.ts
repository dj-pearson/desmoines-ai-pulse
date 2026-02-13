/// <reference types="vite/client" />

/**
 * Global constants injected by vite.config.mobile.ts at build time.
 */

/** Whether the app is running inside a Capacitor native shell. */
declare const __MOBILE_APP__: boolean;

/** ISO timestamp of when the build was produced. */
declare const __BUILD_TIMESTAMP__: string;
