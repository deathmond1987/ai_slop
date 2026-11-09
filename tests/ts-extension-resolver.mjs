import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const extensions = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"];

export async function resolve(specifier, context, nextResolve) {
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
