"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: content is visible by default without JavaScript. */
export function MarketingReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
    node.classList.add("bt-reveal-ready");
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={nodeRef} className={`bt-reveal ${className}`.trim()}>{children}</div>;
}
