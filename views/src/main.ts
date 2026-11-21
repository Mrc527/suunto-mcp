/** Entry of the Suunto views: connects to the host and renders each tool result. */

import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { message } from "./dom.js";
import { renderView } from "./views.js";
import "./style.css";

// The server writes the view name into each resource's <html data-view="...">.
const view = document.documentElement.dataset.view ?? "workouts";
const root = document.getElementById("app")!;
const app = new App({ name: "MCP for Suunto", version: "1.0.0" });

function applyContext(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.ontoolinput = () => {
  root.replaceChildren(message("Loading…"));
};
app.ontoolresult = (result) => {
  renderView(view, result, root, (name, args) => app.callServerTool({ name, arguments: args }));
};
app.ontoolcancelled = () => {
  root.replaceChildren(message("The tool call was cancelled."));
};
app.onhostcontextchanged = applyContext;
app.onteardown = async () => ({});

// Without arguments it talks to the host window over postMessage.
await app.connect();
applyContext(app.getHostContext());
