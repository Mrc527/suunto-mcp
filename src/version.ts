import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function readVersion(): string {
  try {
    return (require("../package.json") as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readVersion();
