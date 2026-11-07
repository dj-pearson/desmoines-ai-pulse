/**
 * Types for scripts/check-postgrest-filters.mjs, which src/lib/__tests__/
 * postgrestFilters.test.ts imports. Without this the strict ratchet reports
 * TS7016 (implicit any module) for the test. Keep in step with the script's
 * exports.
 */
export interface PostgrestFilterProblem {
  line: number;
  expression: string;
}

export interface PostgrestFilterFinding extends PostgrestFilterProblem {
  file: string;
}

export declare const SANITIZER: string;
export declare function checkSource(source: string, fileName?: string): PostgrestFilterProblem[];
export declare function run(root?: string): { files: number; findings: PostgrestFilterFinding[] };
