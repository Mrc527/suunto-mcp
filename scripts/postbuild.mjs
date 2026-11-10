// Make the CLI entry point executable after compilation.
import { chmodSync, existsSync } from "node:fs";

const entry = new URL("../dist/index.js", import.meta.url);
if (existsSync(entry)) chmodSync(entry, 0o755);
