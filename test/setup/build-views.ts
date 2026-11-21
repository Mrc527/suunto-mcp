import { fileURLToPath } from "node:url";
import { build } from "vite";

/** The views are read from dist/views at run time: build them once before the tests. */
export default async function buildViews(): Promise<void> {
  await build({ configFile: fileURLToPath(new URL("../../views/vite.config.ts", import.meta.url)) });
}
