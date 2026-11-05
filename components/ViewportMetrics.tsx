"use client";

import { useEffect } from "react";

function px(value: number): string {
  return `${Math.ceil(value)}px`;
}

export function ViewportMetrics() {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const header = document.querySelector("header");
      const footer = document.querySelector("footer");
      const main = document.querySelector("main");

      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      const mainStyle = main ? getComputedStyle(main) : null;
      const mainPaddingBottom = mainStyle
        ? Number.parseFloat(mainStyle.paddingBottom || "0") || 0
        : 0;

      root.style.setProperty("--layout-header-height", px(headerHeight));
      root.style.setProperty("--layout-footer-height", px(footerHeight));
      root.style.setProperty("--main-bottom-padding", px(mainPaddingBottom));
      root.style.setProperty("--fit-bottom-offset", px(footerHeight + mainPaddingBottom));
      root.classList.toggle("calendar-fit-viewport", Boolean(document.querySelector(".calendar-feed-with-tbd")));
    };

    update();
    window.setTimeout(update, 100);
    window.setTimeout(update, 500);

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);
    const main = document.querySelector("main");
    if (main) {
      resizeObserver.observe(main);
    }

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", update);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return null;
}
