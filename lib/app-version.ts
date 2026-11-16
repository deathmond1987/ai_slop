import packageJson from "../package.json";

export const appVersion = String(packageJson.version).replace(/^[vV]/, "");
