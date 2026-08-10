import { useEffect, useRef, useState, ReactNode } from "react";

interface LazyMountProps {
  children: ReactNode;
  /** Approximate rendered height used for the placeholder, in px */
  placeholderHeight?: number;
  /** How far outside the viewport to start rendering */
  rootMargin?: string;
}

/**
 * Renders its children only once the slot is near the viewport, keeping the
 * DOM small on long lists. Once mounted it stays mounted, so scrolling back
 * up never re-triggers work.
 */
export function LazyMount({
  children,
  placeholderHeight = 220,
  rootMargin = "800px",
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;

  return <div ref={ref} style={{ minHeight: placeholderHeight }} aria-hidden />;
}
