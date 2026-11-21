/**
 * Interactive views (MCP Apps) for AI apps that show them: workouts with route and charts,
 * training statistics, and sleep. Each is a ui:// resource holding the self-contained page built
 * from views/ (npm run build:views); the tools that open one name it in _meta.ui.resourceUri.
 * The tools answer as before, so apps without views see no difference.
 */

import { readFileSync } from "node:fs";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

export const VIEWS = {
  workouts: { uri: "ui://suunto/workouts.html", description: "Workouts: the list, and one workout with its route, heart rate zones and charts" },
  training: { uri: "ui://suunto/training.html", description: "Training statistics per week, month or year" },
  sleep: { uri: "ui://suunto/sleep.html", description: "Sleep stages night by night" },
} as const;

export type ViewName = keyof typeof VIEWS;

/** The built page, next to dist/ (from src/ in development too). */
const PAGE = new URL("../dist/views/index.html", import.meta.url);

let page: string | undefined;

/** The page of one view: the same bundle, told which view to show. */
export function viewHtml(name: ViewName): string {
  if (page === undefined) {
    try {
      page = readFileSync(PAGE, "utf8");
    } catch {
      throw new Error("The views are not built: run npm run build:views.");
    }
  }
  return page.replace('<html lang="en" data-view="">', `<html lang="en" data-view="${name}">`);
}

export function registerViews(server: McpServer): void {
  for (const [name, view] of Object.entries(VIEWS) as Array<[ViewName, (typeof VIEWS)[ViewName]]>) {
    registerAppResource(server, `${name} view`, view.uri, { description: view.description }, async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: viewHtml(name) }],
    }));
  }
}
