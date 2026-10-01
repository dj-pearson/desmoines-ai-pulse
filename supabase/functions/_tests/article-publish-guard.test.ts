import { strict as assert } from "node:assert";
import {
  PUBLISH_GUARD_CODE,
  PUBLISH_GUARD_MARKER,
  publishBlockedReason,
  publishGuardProblem,
} from "../_shared/articlePublishGuard.ts";

// SEO-059: ai-article-pipeline must notice when articles_publishable_body_guard
// (migration 20261016000001) refuses a publish, instead of reporting it as done.

const GUARD_ERROR = {
  code: PUBLISH_GUARD_CODE,
  message: `${PUBLISH_GUARD_MARKER}: body is a JSON or code-fence dump, not article markdown`,
};

Deno.test("publishGuardProblem returns the guard's reason", () => {
  assert.equal(publishGuardProblem(GUARD_ERROR), "body is a JSON or code-fence dump, not article markdown");
});

Deno.test("publishGuardProblem is null for any other failure", () => {
  assert.equal(publishGuardProblem(null), null);
  assert.equal(publishGuardProblem(undefined), null);
  assert.equal(publishGuardProblem({ code: "23514", message: 'violates check constraint "articles_status_check"' }), null);
  assert.equal(publishGuardProblem({ code: "PGRST204", message: "Could not find the 'x' column" }), null);
});

Deno.test("a bare marker still reads as a refusal", () => {
  assert.equal(publishGuardProblem({ message: PUBLISH_GUARD_MARKER }), "body is not publishable");
});

Deno.test("publishBlockedReason names the guard", () => {
  assert.match(publishBlockedReason("x"), /articles_publishable_body_guard: x$/);
});

Deno.test("ai-article-pipeline checks every write and records a blocked publish", async () => {
  const src = await Deno.readTextFile(new URL("../ai-article-pipeline/index.ts", import.meta.url));
  assert.match(src, /const \{ error: publishError \} = await supabase/, "the publish update's error is read");
  assert.match(src, /publishGuardProblem\(publishError\)/, "and classified");
  assert.match(src, /decision = 'blocked'/, "a refused publish is its own decision");
  assert.match(src, /reasons\.push\(publishBlockedReason\(guardProblem\)\)/, "with the reason on the draft");
  assert.match(src, /status: 'draft',[\s\S]{0,120}pipeline_reasons: reasons,/, "written back as a draft");
  assert.match(src, /ctx\.failed\(1\);\s*\} else if \(publishError\)/, "counted as a failed item");
  assert.match(src, /if \(draftError\)/, "the draft write is checked");
  assert.match(src, /if \(deleteError\)/, "and the discard");
});
