import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SafeExternalLink } from '../SafeExternalLink';
import { OpenStatusChip } from '../OpenStatusChip';

const UNSAFE = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x'];

describe('SafeExternalLink', () => {
  it('renders an http(s) URL as a new-tab link', () => {
    const { container } = render(<SafeExternalLink href="www.example.com">site</SafeExternalLink>);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://www.example.com/');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each(UNSAFE)('renders %s as plain text, never as an href', (raw) => {
    const { container } = render(
      <SafeExternalLink href={raw} className="c">
        {raw}
      </SafeExternalLink>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.querySelector('span.c')?.textContent).toBe(raw);
  });

  it('renders nothing for an icon-only link given fallback={null}', () => {
    const { container } = render(
      <SafeExternalLink href="javascript:alert(1)" fallback={null}>
        icon
      </SafeExternalLink>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('OpenStatusChip website fallback', () => {
  it.each(UNSAFE)('does not link %s', (raw) => {
    const { container } = render(<OpenStatusChip hours={null} website={raw} />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('links a real site', () => {
    const { container } = render(<OpenStatusChip hours={null} website="https://example.com" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
  });
});
