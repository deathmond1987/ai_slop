"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function resolveCssPx(cssValue: string): number | null {
  if (!cssValue) return null;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.visibility = "hidden";
  probe.style.height = cssValue;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(height) && height >= 0 ? height : null;
}

export function FitBlock({
  rows,
  bottomGap = 8,
  maxHeightVar,
  className = "",
  children,
}: {
  rows: number;
  bottomGap?: number;
  maxHeightVar?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    const measure = () => {
      const el = node ?? ref.current;
      if (!el || rows <= 0 || window.innerWidth < 1024) {
        el?.style.removeProperty("height");
        setHeight(null);
        return;
      }

      const bottomOffset =
        resolveCssPx(`var(--fit-bottom-offset, ${bottomGap}px)`) ?? bottomGap;

      let max = Infinity;
      if (maxHeightVar) {
        const cardHeight = resolveCssPx(`var(${maxHeightVar})`);
        if (cardHeight !== null) max = cardHeight * rows;
      }

      let top: number;
      if (maxHeightVar && Number.isFinite(max)) {
        el.style.height = `${Math.floor(max)}px`;
        top = el.getBoundingClientRect().top;

        let available = Math.max(0, Math.floor(window.innerHeight - top - bottomOffset));
        let candidate = Math.floor(Math.min(max, available));

        for (let i = 0; i < 4 && candidate > 0; i += 1) {
          el.style.height = `${candidate}px`;
          top = el.getBoundingClientRect().top;
          available = Math.max(0, Math.floor(window.innerHeight - top - bottomOffset));

          const next = Math.floor(Math.min(max, available));
          if (next === candidate) break;
          candidate = next;
        }

        setHeight(candidate);
      } else {
        top = el.getBoundingClientRect().top;
        const available = Math.max(0, Math.floor(window.innerHeight - top - bottomOffset));
        setHeight(Math.floor(Math.min(available, max)));
      }
    };

    measure();
    const timeout = window.setTimeout(measure, 100);
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.body);
    resizeObserver.observe(document.documentElement);
    const main = document.querySelector("main");
    if (main) resizeObserver.observe(main);
    window.addEventListener("resize", measure);

    return () => {
      window.clearTimeout(timeout);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      node?.style.removeProperty("height");
    };
  }, [rows, bottomGap, maxHeightVar]);

  return (
    <div
      ref={ref}
      data-fit-block="true"
      data-fit-rows={rows}
      data-fit-max-height-var={maxHeightVar ?? ""}
      className={className}
      style={height !== null ? { height } : undefined}
    >
      {children}
    </div>
  );
}
