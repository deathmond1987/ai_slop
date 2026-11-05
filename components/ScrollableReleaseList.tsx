"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScrollableReleaseList({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const update = () => {
      const canScroll = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 8;
      setCanScrollDown((prev) => (prev === canScroll ? prev : canScroll));
    };

    update();
    const timers = [100, 400, 900].map((ms) => window.setTimeout(update, ms));

    scroll.addEventListener("scroll", update, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroll);
    if (scroll.firstElementChild) {
      resizeObserver.observe(scroll.firstElementChild);
    }

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(scroll, { childList: true, subtree: true });

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
      scroll.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div className="release-date-scroll-wrap min-h-0">
      <div ref={scrollRef} className="release-date-scroll min-h-0 overflow-auto">
        {children}
      </div>
      {canScrollDown ? (
        <div className="release-scroll-indicator" aria-hidden="true">
          <span>↓</span>
        </div>
      ) : null}
    </div>
  );
}
