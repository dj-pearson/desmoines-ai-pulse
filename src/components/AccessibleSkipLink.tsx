import { cn } from "@/lib/utils";

interface AccessibleSkipLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Skip link for keyboard navigation - allows users to skip to main content
 */
export function AccessibleSkipLink({ href, children, className }: AccessibleSkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        // Position it off-screen by default
        "absolute -top-full left-4 z-[9999] bg-primary text-primary-foreground px-4 py-2 rounded-md",
        // Show on focus
        "focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        // Smooth transition
        "transition-all duration-200 ease-in-out",
        className
      )}
      onFocus={(e) => {
        // Scroll to top when skip link is focused to ensure it's visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      {children}
    </a>
  );
}