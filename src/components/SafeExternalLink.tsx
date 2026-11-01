import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { safeHttpUrl } from '@/lib/safeUrl';

interface SafeExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Stored text that may or may not be a URL: a DB column, a scraped value. */
  href: unknown;
  /**
   * What to render when `href` is not an http(s) URL. Defaults to the
   * children in a <span> with the same className, so a link that shows its
   * own address degrades to plain text. Pass `null` for icon-only links.
   */
  fallback?: ReactNode;
  children?: ReactNode;
}

/**
 * An <a target="_blank"> for a URL we did not build. The value goes through
 * safeHttpUrl, so `javascript:`, `data:` and protocol-relative text never
 * reach an href; CSP is the second line, not the only one.
 *
 * forwardRef because callers put it under Radix `asChild` slots (Button,
 * TooltipTrigger), which hand their ref to the child.
 */
export const SafeExternalLink = forwardRef<HTMLAnchorElement, SafeExternalLinkProps>(
  function SafeExternalLink(
    { href, fallback, children, className, rel = 'noopener noreferrer', target = '_blank', ...rest },
    ref,
  ) {
    const safe = safeHttpUrl(href);
    if (!safe) {
      if (fallback !== undefined) return <>{fallback}</>;
      return <span className={className}>{children}</span>;
    }
    return (
      <a {...rest} ref={ref} href={safe} target={target} rel={rel} className={className}>
        {children}
      </a>
    );
  },
);
