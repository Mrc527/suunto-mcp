/**
 * "Connect your AI app": how to add this server to common AI apps, with one-click links where the
 * app offers them, a command to copy where it has a command line, and short steps otherwise.
 *
 * Checked against each app's documentation in November 2026. Apps change their menus often, so
 * every entry also works with the plain address and the app's own "add MCP server" screen.
 */

import { html, type SafeHtml } from "./html.js";
import { t, th, type MessageKey } from "./i18n/index.js";

export interface ConnectInfo {
  /** The MCP address, e.g. https://padi.example.com/mcp */
  mcpUrl: string;
  /** The signed-in user's e-mail (they sign in with it during the app's sign-in). */
  email: string;
}

/** Name of this server in commands and configuration files (a key: no spaces). */
const NAME = "padi";

/** Name people see in apps that show a display name (the product name, the same in every language). */
const DISPLAY_NAME = "MCP for PADI";

type Group = "chat" | "code" | "desktop" | "other";

/** The groups in order, with the message key of their title (translated when the card is shown). */
const GROUPS: { id: Group; title: MessageKey }[] = [
  { id: "chat", title: "connect.group.chat" },
  { id: "code", title: "connect.group.code" },
  { id: "desktop", title: "connect.group.desktop" },
  { id: "other", title: "connect.group.other" },
];

interface App {
  id: string;
  group: Group;
  name: string;
  /** Short line under the name: what the app is or which plans can use it. */
  hint: string;
  /** Buttons that open the app with the server filled in, or its settings page. */
  links?: { label: string; href: string; secondary?: boolean }[];
  /** A command or configuration to copy. */
  copy?: { label: string; text: string }[];
  steps: (SafeHtml | string)[];
  note?: SafeHtml | string;
}

function apps(info: ConnectInfo): App[] {
  const url = info.mcpUrl;
  const enc = encodeURIComponent;
  const vsJson = enc(JSON.stringify({ name: NAME, type: "http", url }));
  const urlOnly = JSON.stringify({ url });
  const mcpServersJson = JSON.stringify({ mcpServers: { [NAME]: { url } } }, null, 2);
  // "Sign in here as ... and click Allow.": one sentence, used in most apps' steps as {signIn}.
  const signIn = th("connect.signIn", { email: info.email });
  /** A step that may end with the sign-in sentence. */
  const step = (key: MessageKey, params: Record<string, string | SafeHtml> = {}) => th(key, { signIn, ...params });
  const addTo = (app: string) => t("connect.link.addTo", { app });
  const installIn = (app: string) => t("connect.link.installIn", { app });
  const open = (app: string) => t("connect.link.open", { app });
  const runInTerminal = t("connect.copy.runInTerminal");
  const thenSignIn = t("connect.copy.thenSignIn");
  return [
    {
      id: "claude",
      group: "chat",
      name: "Claude",
      hint: t("connect.claude.hint"),
      links: [{ label: addTo("Claude"), href: `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${enc(DISPLAY_NAME)}&connectorUrl=${enc(url)}` }],
      steps: [
        step("connect.claude.step1", { button: addTo("Claude") }),
        step("connect.claude.step2"),
        signIn,
        step("connect.claude.step4"),
      ],
      note: step("connect.claude.note", {
        url: `https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=${enc(DISPLAY_NAME)}&connectorUrl=${enc(url)}`,
      }),
    },
    {
      id: "chatgpt",
      group: "chat",
      name: "ChatGPT",
      hint: t("connect.chatgpt.hint"),
      links: [{ label: t("connect.chatgpt.link"), href: "https://chatgpt.com/plugins" }],
      steps: [step("connect.chatgpt.step1"), step("connect.chatgpt.step2"), step("connect.chatgpt.step3"), step("connect.chatgpt.step4")],
      note: t("connect.chatgpt.note"),
    },
    {
      id: "gemini",
      group: "chat",
      name: "Gemini",
      hint: t("connect.gemini.hint"),
      links: [{ label: open("Gemini"), href: "https://gemini.google.com" }],
      steps: [step("connect.gemini.step1"), step("connect.gemini.step2"), t("connect.gemini.step3")],
    },
    {
      id: "le-chat",
      group: "chat",
      name: "Le Chat (Mistral)",
      hint: "chat.mistral.ai",
      links: [{ label: open("Le Chat"), href: "https://chat.mistral.ai" }],
      steps: [step("connect.leChat.step1"), step("connect.leChat.step2", { name: NAME })],
      note: t("connect.leChat.note"),
    },
    {
      id: "perplexity",
      group: "chat",
      name: "Perplexity",
      hint: t("connect.perplexity.hint"),
      links: [{ label: open("Perplexity"), href: "https://www.perplexity.ai" }],
      steps: [step("connect.perplexity.step1"), step("connect.perplexity.step2")],
    },
    {
      id: "claude-code",
      group: "code",
      name: "Claude Code",
      hint: t("connect.claudeCode.hint"),
      copy: [
        { label: runInTerminal, text: `claude mcp add --transport http ${NAME} --scope user ${url}` },
        { label: thenSignIn, text: `claude mcp login ${NAME}` },
      ],
      steps: [step("connect.claudeCode.step1", { command: "/mcp" })],
      note: t("connect.claudeCode.note"),
    },
    {
      id: "codex",
      group: "code",
      name: "Codex",
      hint: t("connect.codex.hint"),
      copy: [{ label: runInTerminal, text: `codex mcp add ${NAME} --url ${url}` }],
      steps: [step("connect.codex.step1"), step("connect.codex.step2")],
    },
    {
      id: "cursor",
      group: "code",
      name: "Cursor",
      hint: t("connect.cursor.hint"),
      links: [{ label: addTo("Cursor"), href: `https://cursor.com/install-mcp?name=${NAME}&config=${enc(Buffer.from(urlOnly).toString("base64"))}` }],
      copy: [{ label: t("connect.copy.orAddToFile", { file: "~/.cursor/mcp.json" }), text: mcpServersJson }],
      steps: [step("connect.cursor.step1", { button: addTo("Cursor") }), step("connect.cursor.step2", { command: `agent mcp login ${NAME}` })],
    },
    {
      id: "vscode",
      group: "code",
      name: "VS Code",
      hint: t("connect.vscode.hint"),
      links: [
        { label: installIn("VS Code"), href: `https://vscode.dev/redirect?url=${enc(`vscode:mcp/install?${vsJson}`)}` },
        { label: "VS Code Insiders", href: `https://vscode.dev/redirect?url=${enc(`vscode-insiders:mcp/install?${vsJson}`)}`, secondary: true },
      ],
      copy: [{ label: t("connect.copy.orRun"), text: `code --add-mcp '${JSON.stringify({ name: NAME, type: "http", url })}'` }],
      steps: [step("connect.vscode.step1", { button: installIn("VS Code") }), step("connect.vscode.step2"), step("connect.vscode.step3")],
      note: t("connect.vscode.note"),
    },
    {
      id: "visual-studio",
      group: "code",
      name: "Visual Studio",
      hint: t("connect.visualStudio.hint"),
      links: [{ label: installIn("Visual Studio"), href: `https://vs-open.link/mcp-install?${vsJson}` }],
      steps: [step("connect.visualStudio.step1", { button: installIn("Visual Studio") }), step("connect.visualStudio.step2", { file: ".mcp.json" })],
    },
    {
      id: "copilot-cli",
      group: "code",
      name: "GitHub Copilot CLI",
      hint: t("connect.copilotCli.hint"),
      copy: [{ label: runInTerminal, text: `copilot mcp add --transport http ${NAME} ${url}` }],
      steps: [step("connect.copilotCli.step1", { command: `/mcp auth ${NAME}` })],
    },
    {
      id: "gemini-cli",
      group: "code",
      name: "Gemini CLI",
      hint: t("connect.geminiCli.hint"),
      copy: [{ label: runInTerminal, text: `gemini mcp add --transport http --scope user ${NAME} ${url}` }],
      steps: [step("connect.geminiCli.step1")],
    },
    {
      id: "windsurf",
      group: "code",
      name: "Windsurf (Devin Desktop)",
      hint: t("connect.windsurf.hint"),
      copy: [
        { label: runInTerminal, text: `devin mcp add -s user ${NAME} ${url}` },
        { label: thenSignIn, text: `devin mcp login ${NAME}` },
      ],
      steps: [
        step("connect.windsurf.step1"),
        step("connect.windsurf.step2", { snippet: html`"${NAME}": { "serverUrl": "${url}" }`, key: "mcpServers" }),
      ],
      note: t("connect.windsurf.note"),
    },
    {
      id: "zed",
      group: "code",
      name: "Zed",
      hint: t("connect.zed.hint"),
      copy: [{ label: t("connect.copy.addToFile", { file: "settings.json" }), text: JSON.stringify({ context_servers: { [NAME]: { url } } }, null, 2) }],
      steps: [step("connect.zed.step1"), step("connect.zed.step2")],
    },
    {
      id: "jetbrains",
      group: "code",
      name: t("connect.jetbrains.name"),
      hint: t("connect.jetbrains.hint"),
      copy: [
        // Only names: the same in every language.
        { label: "Junie: ~/.junie/mcp/mcp.json", text: mcpServersJson },
        { label: t("connect.jetbrains.copyAiAssistant"), text: JSON.stringify({ mcpServers: { [NAME]: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2) },
      ],
      steps: [step("connect.jetbrains.step1", { command: "/mcp" }), step("connect.jetbrains.step2")],
    },
    {
      id: "kiro",
      group: "code",
      name: "Kiro",
      hint: t("connect.kiro.hint"),
      links: [{ label: addTo("Kiro"), href: `https://kiro.dev/launch/mcp/add?name=${NAME}&config=${enc(urlOnly)}` }],
      copy: [{ label: t("connect.copy.orAddToFile", { file: "~/.kiro/settings/mcp.json" }), text: mcpServersJson }],
      steps: [step("connect.kiro.step1", { button: addTo("Kiro") })],
    },
    {
      id: "cline",
      group: "code",
      name: "Cline",
      hint: t("connect.cline.hint"),
      copy: [{ label: runInTerminal, text: `cline mcp add ${NAME} ${url} --transport http --yes` }],
      steps: [step("connect.cline.step1"), step("connect.cline.step2")],
    },
    {
      id: "warp",
      group: "code",
      name: "Warp",
      hint: t("connect.warp.hint"),
      copy: [{ label: t("connect.warp.copy"), text: mcpServersJson }],
      steps: [step("connect.warp.step1")],
    },
    {
      id: "raycast",
      group: "desktop",
      name: "Raycast",
      hint: t("connect.raycast.hint"),
      steps: [step("connect.raycast.step1"), step("connect.raycast.step2")],
    },
    {
      id: "lm-studio",
      group: "desktop",
      name: "LM Studio",
      hint: t("connect.lmStudio.hint"),
      links: [{ label: addTo("LM Studio"), href: `lmstudio://add_mcp?name=${NAME}&config=${enc(Buffer.from(urlOnly).toString("base64"))}` }],
      copy: [{ label: t("connect.lmStudio.copy", { file: "mcp.json" }), text: mcpServersJson }],
      steps: [step("connect.lmStudio.step1", { button: addTo("LM Studio") })],
      note: t("connect.lmStudio.note"),
    },
    {
      id: "goose",
      group: "desktop",
      name: "Goose",
      hint: t("connect.goose.hint"),
      links: [
        {
          label: addTo("Goose"),
          href: `goose://extension?url=${enc(url)}&type=streamable_http&id=${NAME}&name=${enc(DISPLAY_NAME)}&description=${enc("PADI dive logbook")}&timeout=300`,
        },
      ],
      steps: [step("connect.goose.step1", { button: addTo("Goose") }), step("connect.goose.step2", { command: "goose configure" })],
    },
    {
      id: "jan",
      group: "desktop",
      name: "Jan",
      hint: t("connect.jan.hint"),
      copy: [{ label: runInTerminal, text: `jan cli mcp add ${NAME} --type http --url ${url} --active` }],
      steps: [step("connect.jan.step1"), step("connect.jan.step2")],
    },
    {
      id: "msty",
      group: "desktop",
      name: "Msty Studio",
      hint: t("connect.msty.hint"),
      steps: [step("connect.msty.step1"), step("connect.msty.step2")],
    },
    {
      id: "open-webui",
      group: "desktop",
      name: "Open WebUI",
      hint: t("connect.openWebui.hint"),
      steps: [step("connect.openWebui.step1"), step("connect.openWebui.step2")],
    },
    {
      id: "librechat",
      group: "desktop",
      name: "LibreChat",
      hint: t("connect.librechat.hint"),
      copy: [{ label: t("connect.librechat.copy", { file: "librechat.yaml" }), text: `mcpServers:\n  ${NAME}:\n    type: streamable-http\n    url: ${url}\n    requiresOAuth: true` }],
      steps: [step("connect.librechat.step1", { file: "librechat.yaml" }), step("connect.librechat.step2")],
    },
    {
      id: "n8n",
      group: "desktop",
      name: "n8n",
      hint: t("connect.n8n.hint"),
      steps: [step("connect.n8n.step1"), step("connect.n8n.step2")],
    },
    {
      id: "other",
      group: "other",
      name: t("connect.other.name"),
      hint: t("connect.other.hint"),
      copy: [
        { label: t("connect.other.copyJson"), text: mcpServersJson },
        { label: t("connect.other.copyLocal"), text: JSON.stringify({ mcpServers: { [NAME]: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2) },
      ],
      steps: [step("connect.other.step1"), step("connect.other.step2"), step("connect.other.step3", { command: "mcp-remote" })],
    },
  ];
}

/** The "Connect your AI app" card for the account page. */
export function connectCard(info: ConnectInfo): SafeHtml {
  let n = 0;
  const all = apps(info);
  const item = (app: App) => html`<details class="app" id="app-${app.id}">
    <summary><span class="app-name">${app.name}</span><span class="app-hint">${app.hint}</span></summary>
    <div class="app-body">
      ${app.links?.length
        ? html`<div class="actions">${app.links.map((l) => /^https:/.test(l.href)
                ? html`<a class="button${l.secondary ? " secondary" : ""}" href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`
                : html`<a class="button${l.secondary ? " secondary" : ""}" href="${l.href}">${l.label}</a>`)}</div>`
        : ""}
      ${(app.copy ?? []).map((c) => {
        const id = `cmd-${app.id}-${++n}`;
        return html`<p class="copy-label">${c.label}</p><div class="copy"><code id="${id}"${c.text.includes("\n") ? html` class="pre"` : ""}>${c.text}</code><button type="button" class="secondary small" data-copy="${id}">${t("common.copy")}</button></div>`;
      })}
      <ol class="steps">${app.steps.map((s) => html`<li>${s}</li>`)}</ol>
      ${app.note ? html`<p class="muted">${app.note}</p>` : ""}
    </div>
  </details>`;
  return html`<div class="card" id="connect">
    <h2>${t("connect.title")}</h2>
    <p>${t("connect.intro")}</p>
    <div class="copy"><code id="mcp-url">${info.mcpUrl}</code><button type="button" class="secondary small" data-copy="mcp-url">${t("common.copy")}</button></div>
    ${GROUPS.map((g) => {
      const list = all.filter((a) => a.group === g.id);
      return list.length ? html`<h3 class="apps-group">${t(g.title)}</h3><div class="apps">${list.map(item)}</div>` : "";
    })}
  </div>`;
}
