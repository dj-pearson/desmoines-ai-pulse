import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LazySectionProps {
  children: React.ReactNode;
  className?: string;
  rootMargin?: string;
  minHeight?: number | string; // Reserve space to avoid layout shift
}

export default function LazySection({
  children,
  className,
  rootMargin = "200px",
  minHeight = 200,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return; // Already visible, no need to observe

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return (
    <div ref={ref} className={cn("cv-auto", className)} style={{ containIntrinsicSize: undefined }}>
      {visible ? (
        children
      ) : (
        <div style={{ minHeight }} aria-hidden="true" className="animate-pulse bg-muted rounded-md" />
      )}
    </div>
  );
}
