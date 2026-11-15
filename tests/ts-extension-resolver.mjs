import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const extensions = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: new URL("./server-only-stub.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }

  if (specifier === "next/server") {
    return {
      url: new URL("../node_modules/next/server.js", import.meta.url).href,
      shortCircuit: true,
    };
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-z0-9]+$/i.test(specifier)
  ) {
    const parentUrl = context.parentURL;
    if (parentUrl?.startsWith("file:")) {
      const candidates = extensions.map((ext) => new URL(`${specifier}${ext}`, parentUrl));
      for (const candidate of candidates) {
        try {
          if (existsSync(fileURLToPath(candidate))) {
            return {
              url: candidate.href,
              shortCircuit: true,
            };
          }
        } catch {
          // Fall through to the default resolver.
        }
      }
    }
  }

  return nextResolve(specifier, context);
}
