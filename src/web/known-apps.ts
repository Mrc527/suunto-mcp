/**
 * Where an app sends the answer of the consent page (its redirect address), and whether the
 * consent page can vouch for it.
 *
 * Apps are recognized by that address, never by the name they give themselves: anyone can
 * register an app called "Claude", but only Anthropic receives what is sent to
 * https://claude.ai/api/mcp/auth_callback. An app is "known" only when the answer goes to one of
 * the exact addresses below (scheme, host and path; a whole host is not enough, because a site can
 * have pages that pass the answer on). Answers to http://localhost, to an app's own scheme
 * (com.example.app:/callback), or to VS Code's redirect page (which passes them to VS Code on this
 * computer) stay on the device where the browser runs. Every other address is "unknown": the page
 * warns and asks for a confirmation.
 */

export interface KnownApp {
  /** The app's name as people know it. */
  name: string;
  /** Exact redirect addresses (origin and path), or patterns for addresses with an id in them. */
  redirects: (string | RegExp)[];
  /** Other names the app is known by (for spotting an app that pretends to be it). */
  aliases?: string[];
}

/**
 * Sources: Claude's and ChatGPT's published client metadata (pinned in oauth.ts), Anthropic's and
 * OpenAI's connector documentation, Perplexity's "Adding custom remote connectors" help article,
 * and the redirect lists that MCP providers publish for Le Chat and Cursor.
 */
export const KNOWN_APPS: KnownApp[] = [
  { name: "Claude", redirects: ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"], aliases: ["Anthropic"] },
  {
    name: "ChatGPT",
    redirects: ["https://chatgpt.com/connector_platform_oauth_redirect", /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,100}$/],
    aliases: ["OpenAI"],
  },
  { name: "Le Chat (Mistral)", redirects: ["https://callback.mistral.ai/v1/integrations_auth/oauth2_callback"], aliases: ["Le Chat", "Mistral"] },
  { name: "Perplexity", redirects: ["https://www.perplexity.ai/rest/connections/oauth_callback", "https://enterprise.perplexity.ai/rest/connections/oauth_callback"] },
  { name: "Cursor", redirects: ["https://www.cursor.com/agents/mcp/oauth/callback"] },
];

/** Pages that pass the answer on to an app on this computer (chosen by the request itself). */
const DEVICE_FORWARDERS: { name: string; redirects: string[]; aliases?: string[] }[] = [
  { name: "VS Code", redirects: ["https://vscode.dev/redirect", "https://insiders.vscode.dev/redirect"], aliases: ["Visual Studio Code"] },
];

export type ReturnTarget =
  /** A well-known AI app (by its exact redirect address). */
  | { kind: "known"; app: string; host: string }
  /** An app on the device where the browser runs (localhost, an app's own scheme, VS Code). */
  | { kind: "device"; host: string }
  /** Any other web address. `claims` is a well-known app's name that the app uses without being it. */
  | { kind: "unknown"; host: string; claims?: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Letters from other scripts that look like Latin ones (Cyrillic, Greek, ...), folded for comparing. */
const LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ԁ: "d", ӏ: "l", һ: "h", ѕ: "s", ԛ: "q", ԝ: "w", ɡ: "g", ı: "i",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", "0": "o", "1": "l",
};

/** A name reduced to plain Latin letters, so lookalikes and hidden characters compare equal. */
function skeleton(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/./gsu, (c) => LOOKALIKES[c] ?? c)
    .replace(/[^a-z]/g, "");
}

/** The well-known app whose name (or another name of it) appears anywhere in `name`. */
function claimedApp(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const plain = skeleton(name);
  for (const app of [...KNOWN_APPS, ...DEVICE_FORWARDERS]) {
    for (const label of [app.name, ...(app.aliases ?? [])]) {
      if (plain.includes(skeleton(label.replace(/\(.*\)/, "")))) return app.name;
    }
  }
  return undefined;
}

function matches(address: string, redirects: (string | RegExp)[]): boolean {
  return redirects.some((r) => (typeof r === "string" ? r === address : r.test(address)));
}

/** What the consent page should say about where the answer goes. */
export function classifyReturn(redirectUri: string, clientName?: string): ReturnTarget {
  let u: URL;
  try {
    u = new URL(redirectUri);
  } catch {
    return { kind: "unknown", host: redirectUri };
  }
  const hostname = u.hostname.toLowerCase();
  if ((u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.has(hostname)) return { kind: "device", host: u.host };
  if (u.protocol === "https:") {
    // Origin and path only: the query is the app's own business, the answer goes to the same page.
    const address = u.username || u.password || u.port ? "" : `${u.origin}${u.pathname}`;
    const app = KNOWN_APPS.find((a) => matches(address, a.redirects));
    if (app) return { kind: "known", app: app.name, host: u.host };
    if (DEVICE_FORWARDERS.some((f) => matches(address, f.redirects))) return { kind: "device", host: u.host };
    const claims = claimedApp(clientName);
    return { kind: "unknown", host: u.host, ...(claims ? { claims } : {}) };
  }
  // An app's own scheme (RFC 8252), e.g. com.example.app:/callback: shown by its scheme.
  if (u.protocol !== "http:") return { kind: "device", host: u.protocol.replace(/:$/, "") };
  return { kind: "unknown", host: u.host };
}

/** An app's self-chosen name for display: without invisible or direction-changing characters. */
export function displayName(name: string): string {
  return name.replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, "").trim();
}
