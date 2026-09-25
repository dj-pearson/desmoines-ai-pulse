/**
 * Versions of the documents the sign-up terms checkbox agrees to.
 *
 * One copy for every writer of a terms consent row: the email sign-up form
 * (Auth.tsx) and the OAuth "finish setting up" step (AuthCallback.tsx). Two
 * hand-kept copies would record OAuth accounts against a different policy text
 * than email ones the first time only one was bumped.
 */
export const TERMS_VERSION = "2026-03-10";
export const PRIVACY_VERSION = "2025-11-25";
