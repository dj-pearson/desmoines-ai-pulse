import { describe, it, expect } from 'vitest';
import { articlePublishGuardMessage, articlePublishGuardProblem } from '../articlePublishGuard';

// The message the trigger in 20261016000001 raises, as PostgREST returns it.
const GUARD_ERROR = {
  code: '23514',
  message: 'article_body_not_publishable: body is raw HTML, not markdown',
  hint: 'Store the article body as clean markdown before publishing (SEO-058).',
};

describe('articlePublishGuardProblem', () => {
  it('pulls the reason out of the guard error', () => {
    expect(articlePublishGuardProblem(GUARD_ERROR)).toBe('body is raw HTML, not markdown');
  });

  it('ignores every other error, including other CHECK violations', () => {
    expect(articlePublishGuardProblem({ code: '23514', message: 'new row violates check constraint "x"' })).toBeNull();
    expect(articlePublishGuardProblem(new Error('network'))).toBeNull();
    expect(articlePublishGuardProblem(null)).toBeNull();
    expect(articlePublishGuardProblem('article_body_not_publishable')).toBeNull();
  });
});

describe('articlePublishGuardMessage', () => {
  it('tells the editor what to fix', () => {
    const msg = articlePublishGuardMessage(GUARD_ERROR);
    expect(msg).toContain("can't be published yet");
    expect(msg).toContain('body is raw HTML, not markdown');
  });

  it('is null for other errors, so the raw message is shown', () => {
    expect(articlePublishGuardMessage({ message: 'permission denied' })).toBeNull();
  });
});
