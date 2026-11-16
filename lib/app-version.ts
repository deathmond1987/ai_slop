import "server-only";
import packageJson from "../package.json";
import { spawnSync } from "node:child_process";

const semverPattern = /^([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?$/;

function normalizeVersion(raw: string | undefined): string | undefined {
  const value = String(raw ?? "").trim().replace(/^[vV]/, "");
  return value && semverPattern.test(value) ? value : undefined;
}

function gitTagVersion(): string | undefined {
  if (process.env.GITHUB_REF_TYPE === "tag") {
    const direct = normalizeVersion(process.env.GITHUB_REF_NAME);
    if (direct) return direct;
  }

  const refTag = process.env.GITHUB_REF?.match(/refs\/tags\/(.+)$/);
  return normalizeVersion(refTag?.[1]);
}

function runGitDescribe(): string | undefined {
  try {
    const result = spawnSync("git", ["describe", "--tags", "--abbrev=0"], {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || !result.stdout) return undefined;
    return normalizeVersion(result.stdout);
  } catch {
    return undefined;
  }
}

let gitDescribeChecked = false;
let gitDescribeVersion: string | undefined;

function gitDescribeVersionTag(): string | undefined {
  if (!gitDescribeChecked) {
    gitDescribeChecked = true;
    gitDescribeVersion = runGitDescribe();
  }
  return gitDescribeVersion;
}

export function getAppVersion(): string {
  return (
    normalizeVersion(process.env.STEAM_CALENDAR_VERSION) ||
    normalizeVersion(process.env.APP_VERSION) ||
    normalizeVersion(process.env.VERSION_INPUT) ||
    normalizeVersion(process.env.VERSION) ||
    gitTagVersion() ||
    gitDescribeVersionTag() ||
    normalizeVersion(packageJson.version) ||
    "unknown"
  );
}
