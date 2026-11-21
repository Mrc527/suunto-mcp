import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained HTML file: hosts load it as a ui:// resource, also over stdio (no asset URLs).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL("../dist/views", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
  logLevel: "warn",
});
