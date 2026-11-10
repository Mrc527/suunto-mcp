/**
 * English texts: connect ("Connect your AI app" card on the account page). Keys start with "connect.".
 *
 * Keep app names, commands, file names, URLs and the server's names as they are: the product name
 * "MCP for PADI" (the name people see in their app) and "padi" (in commands). Most of them
 * are placeholders ({app}, {command}, {file}, {name}, {key}, {snippet}, {url}). The names of buttons
 * and menus inside the other apps are shown in <strong>; translate them only where the app itself is
 * translated. {button} is the label of our own button ("connect.link.*"), so the step and the button
 * always match. {signIn} is the sentence "connect.signIn" (with the person's e-mail).
 * In messages with markup, a menu arrow is written "&gt;"; in plain messages it is a bare ">".
 */
export default {
  // The card
  "connect.title": "Connect your AI app",
  "connect.intro":
    "MCP for PADI works with any AI app that supports MCP servers: Claude, ChatGPT, Gemini, Codex, Cursor, VS Code and many more. Everyone uses the same address and signs in with their own account here. Pick your app for the steps.",

  // Group titles
  "connect.group.chat": "Chat assistants",
  "connect.group.code": "Coding tools",
  "connect.group.desktop": "Desktop and self-hosted apps",
  "connect.group.other": "Anything else",

  // Shared texts
  "connect.signIn": "Sign in here as <strong>{email}</strong> and click <strong>Allow</strong>.",
  "connect.link.addTo": "Add to {app}",
  "connect.link.installIn": "Install in {app}",
  "connect.link.open": "Open {app}",
  "connect.copy.runInTerminal": "Run in a terminal",
  "connect.copy.thenSignIn": "Then sign in",
  "connect.copy.orRun": "Or run",
  "connect.copy.addToFile": "Add to {file}",
  "connect.copy.orAddToFile": "Or add to {file}",

  // Claude
  "connect.claude.hint": "claude.ai, the desktop app and the mobile apps",
  "connect.claude.step1":
    "Click <strong>{button}</strong>. It opens Claude with the name and address filled in. (Or open <strong>Customize &gt; Connectors &gt; Add custom connector</strong> and paste the address.)",
  "connect.claude.step2": "Keep the defaults (\"Use Claude's published identity\") and click <strong>Add</strong>, then <strong>Connect</strong>.",
  // Step 3 is the shared sentence "connect.signIn".
  "connect.claude.step4":
    "In a chat, turn on MCP for PADI with <strong>+ &gt; Connectors</strong>. It works on the web, on the desktop and on the phone (add it on the web or desktop first).",
  "connect.claude.note":
    "Free plans can add one custom connector. On Team and Enterprise plans an owner adds it once under <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Organization settings &gt; Connectors</a>, then each member clicks Connect and signs in with their own account.",

  // ChatGPT
  "connect.chatgpt.hint": "chatgpt.com (added on the web, then usable everywhere)",
  "connect.chatgpt.link": "Open ChatGPT plugins",
  "connect.chatgpt.step1": "On chatgpt.com open <strong>Plugins</strong>, click <strong>+</strong> and choose <strong>Add custom MCP server</strong>.",
  "connect.chatgpt.step2":
    "Name it \"MCP for PADI\", paste the address above as <strong>Server URL</strong> and pick <strong>OAuth</strong> for authentication. Confirm the warning and create it.",
  "connect.chatgpt.step3": "Open your plugins and add MCP for PADI. {signIn}",
  "connect.chatgpt.step4": "In a chat, type <strong>@</strong> and pick MCP for PADI.",
  "connect.chatgpt.note":
    "Custom MCP servers depend on your ChatGPT plan and workspace settings. On some personal plans ChatGPT only allows reading, so logging or changing dives may be blocked there.",

  // Gemini
  "connect.gemini.hint": "gemini.google.com (personal Google accounts in the US)",
  "connect.gemini.step1":
    "On a computer open <strong>Settings &gt; Connected Apps</strong>, then under <strong>Custom apps</strong> click <strong>Add a custom app</strong>.",
  "connect.gemini.step2": "Paste the address, click <strong>Next</strong> and sign in. {signIn}",
  "connect.gemini.step3": "Once added on the web, it also works in the Gemini mobile app.",

  // Le Chat (Mistral)
  "connect.leChat.step1": "Open the side panel, <strong>Intelligence &gt; Connectors &gt; Add Connector</strong>, tab <strong>Custom MCP Connector</strong>.",
  "connect.leChat.step2": "Name it <code>{name}</code> (no spaces), paste the address and click <strong>Connect</strong>. {signIn}",
  "connect.leChat.note": "On team plans only an administrator can add connectors.",

  // Perplexity
  "connect.perplexity.hint": "web and Mac app, Pro, Max and Enterprise",
  "connect.perplexity.step1":
    "Open <strong>Plugins</strong> (or <strong>Settings &gt; Connectors</strong>), <strong>Add custom &gt; Add MCP connector &gt; Remote</strong>.",
  "connect.perplexity.step2":
    "Name \"MCP for PADI\", paste the address. Under <strong>Advanced</strong> choose <strong>OAuth</strong> and <strong>Streamable HTTP</strong>. Save, turn it on and sign in. {signIn}",

  // Claude Code
  "connect.claudeCode.hint": "terminal, VS Code and JetBrains",
  "connect.claudeCode.step1": "Run the two commands (or type <code>{command}</code> in Claude Code). A browser opens. {signIn}",
  "connect.claudeCode.note": "Already added MCP for PADI on claude.ai? Claude Code signed in with the same Claude account lists it by itself.",

  // Codex
  "connect.codex.hint": "OpenAI's coding agent: terminal, IDE extension, ChatGPT desktop app",
  "connect.codex.step1": "Run the command. Codex opens a browser. {signIn}",
  "connect.codex.step2":
    "In the IDE extension or the desktop app you can also use <strong>Settings &gt; MCP servers &gt; Add server</strong>, choose <strong>Streamable HTTP</strong>, paste the address and click <strong>Authenticate</strong>. All of them share the same settings.",

  // Cursor
  "connect.cursor.hint": "the editor and its agent command",
  "connect.cursor.step1": "Click <strong>{button}</strong> and confirm <strong>Install</strong> in Cursor.",
  "connect.cursor.step2": "Cursor asks you to sign in the first time it uses MCP for PADI (in the terminal: <code>{command}</code>). {signIn}",

  // VS Code
  "connect.vscode.hint": "GitHub Copilot in agent mode",
  "connect.vscode.step1": "Click <strong>{button}</strong> and confirm <strong>Install</strong> in VS Code.",
  "connect.vscode.step2": "Start the server when VS Code asks. A browser opens. {signIn}",
  "connect.vscode.step3": "Use it in Copilot Chat in <strong>Agent</strong> mode.",
  "connect.vscode.note": "Copilot Business and Enterprise: an administrator has to allow MCP servers.",

  // Visual Studio
  "connect.visualStudio.hint": "Visual Studio 2026 or 2022 17.14, GitHub Copilot",
  "connect.visualStudio.step1": "Click <strong>{button}</strong> and confirm.",
  "connect.visualStudio.step2": "In the <code>{file}</code> file, click <strong>Authentication Required</strong> above the server. {signIn}",

  // GitHub Copilot CLI
  "connect.copilotCli.hint": "the copilot command",
  "connect.copilotCli.step1": "Run the command. When Copilot asks you to sign in (or after <code>{command}</code>), a browser opens. {signIn}",

  // Gemini CLI
  "connect.geminiCli.hint": "Google's command-line agent",
  "connect.geminiCli.step1": "Run the command. The first time Gemini CLI uses MCP for PADI it opens a browser. {signIn}",

  // Windsurf (Devin Desktop)
  "connect.windsurf.hint": "Devin Local, Devin CLI and the legacy Cascade",
  "connect.windsurf.step1": "Run the two commands. Devin Desktop reads the same settings. {signIn}",
  "connect.windsurf.step2":
    "Legacy Windsurf editor: in Cascade open the MCP menu, <strong>Open MCP config file</strong>, add <code>{snippet}</code> under <code>{key}</code> and refresh.",
  "connect.windsurf.note": "On Enterprise plans an administrator has to allow MCP servers.",

  // Zed
  "connect.zed.hint": "the Zed editor's agent",
  "connect.zed.step1":
    "Open <strong>Settings &gt; AI &gt; MCP Servers &gt; Add Server &gt; Add Remote Server</strong> and paste the address, or add the snippet to your settings file.",
  "connect.zed.step2": "Click <strong>Authenticate</strong> when Zed asks. {signIn}",

  // JetBrains IDEs
  "connect.jetbrains.name": "JetBrains IDEs",
  "connect.jetbrains.hint": "Junie and AI Assistant in IntelliJ IDEA, PyCharm, WebStorm and others",
  "connect.jetbrains.copyAiAssistant": "AI Assistant: if it does not open a sign-in",
  "connect.jetbrains.step1":
    "<strong>Junie</strong>: add the first snippet (or in Junie CLI: <code>{command}</code>, then add a remote server), then choose <strong>Authorize</strong>. {signIn}",
  "connect.jetbrains.step2":
    "<strong>AI Assistant</strong>: <strong>Settings &gt; Tools &gt; AI Assistant &gt; Model Context Protocol (MCP) &gt; Add &gt; JSON configuration</strong>, paste a snippet, then <strong>OK</strong> and <strong>Apply</strong>.",

  // Kiro
  "connect.kiro.hint": "IDE, CLI and web",
  "connect.kiro.step1": "Click <strong>{button}</strong> and confirm in Kiro. Kiro opens the sign-in by itself. {signIn}",

  // Cline
  "connect.cline.hint": "VS Code and JetBrains extension, Cline CLI",
  "connect.cline.step1":
    "Run the command, or in the Cline panel open <strong>MCP Servers &gt; Remote Servers</strong>, enter the name and address and pick <strong>Streamable HTTP</strong>.",
  "connect.cline.step2": "Approve the sign-in when Cline asks. {signIn}",

  // Warp
  "connect.warp.hint": "the terminal's agents",
  "connect.warp.copy": "Paste in Settings > Agents > MCP servers > + Add",
  "connect.warp.step1": "Paste the snippet, click <strong>Start</strong> and complete the sign-in in the browser. {signIn}",

  // Raycast
  "connect.raycast.hint": "Mac, Windows and iPhone, Raycast Pro",
  "connect.raycast.step1":
    "Run <strong>Install MCP Server</strong>. Name \"MCP for PADI\", Transport <strong>HTTP</strong>, paste the address, OAuth type <strong>Dynamic</strong>, then <strong>Install</strong>.",
  "connect.raycast.step2": "Click <strong>Sign In</strong>. {signIn}",

  // LM Studio
  "connect.lmStudio.hint": "local models, version 0.4.10 or later",
  "connect.lmStudio.copy": "Or add to {file} (Program tab > Install > Edit {file})",
  "connect.lmStudio.step1": "Click <strong>{button}</strong> (with LM Studio installed) and confirm. Then sign in in the browser. {signIn}",
  "connect.lmStudio.note": "Use a model that supports tool calling.",

  // Goose
  "connect.goose.hint": "goose Desktop and CLI",
  "connect.goose.step1": "Click <strong>{button}</strong> (with goose Desktop installed) and confirm. Goose signs in by itself. {signIn}",
  "connect.goose.step2":
    "CLI: <code>{command}</code> &gt; <strong>Add Extension</strong> &gt; <strong>Remote Extension (Streamable HTTP)</strong>, then paste the address.",

  // Jan
  "connect.jan.hint": "Jan Desktop and Jan CLI",
  "connect.jan.step1":
    "Run the command, or in Jan Desktop open <strong>Settings &gt; MCP Servers &gt; Add MCP Server</strong>, transport <strong>HTTP</strong>, and paste the address.",
  "connect.jan.step2": "Use the server's <strong>Sign in</strong> action. {signIn}",

  // Msty Studio
  "connect.msty.hint": "desktop app",
  "connect.msty.step1":
    "<strong>Toolbox &gt; Tools &gt; Add New Tool</strong>, name \"MCP for PADI\", choose <strong>HTTP</strong>, paste the address and pick <strong>OAuth</strong>.",
  "connect.msty.step2": "Click <strong>Test tool</strong>, sign in, then <strong>Save</strong>. {signIn}",

  // Open WebUI
  "connect.openWebui.hint": "self-hosted, version 0.6.31 or later, added by an administrator",
  "connect.openWebui.step1":
    "Administrator: <strong>Settings &gt; Admin &gt; Integrations &gt; External Tool Servers &gt; Add Connection</strong>, type <strong>MCP (Streamable HTTP)</strong>, paste the address, auth <strong>OAuth 2.1</strong>, click <strong>Register Client</strong> and save.",
  "connect.openWebui.step2": "Each person: in a chat, <strong>+ &gt; Integrations &gt; Tools</strong>, turn on MCP for PADI and sign in. {signIn}",

  // LibreChat
  "connect.librechat.hint": "self-hosted",
  "connect.librechat.copy": "{file} (administrator)",
  "connect.librechat.step1":
    "Add it to <code>{file}</code> and restart, or in the side panel use <strong>MCP Settings &gt; Add MCP</strong> with transport <strong>Streamable HTTPS</strong>.",
  "connect.librechat.step2": "Click <strong>Connect</strong>, then <strong>Continue with OAuth</strong>. {signIn}",

  // n8n
  "connect.n8n.hint": "AI Agent workflows",
  "connect.n8n.step1":
    "In an <strong>AI Agent</strong> node add the <strong>MCP Client Tool</strong>. Endpoint: the address, transport <strong>HTTP Streamable</strong>.",
  "connect.n8n.step2":
    "Authentication <strong>MCP OAuth2</strong>, create a credential (keep \"Use Dynamic Client Registration\" on) and connect. {signIn}",

  // Other AI apps
  "connect.other.name": "Other AI apps",
  "connect.other.hint": "any app that supports remote MCP servers",
  "connect.other.copyJson": "Most apps (JSON)",
  "connect.other.copyLocal": "Apps that only run local servers",
  "connect.other.step1":
    "Look for <strong>Add MCP server</strong> (sometimes \"custom connector\" or \"tools\") and use the address above. Choose <strong>HTTP</strong> or <strong>Streamable HTTP</strong> if asked.",
  "connect.other.step2": "Sign-in uses OAuth: the app opens this site. {signIn} No API key or password goes into the app.",
  "connect.other.step3":
    "If the app can only start local programs, or cannot sign in to remote servers (for example Roo Code and Continue), use the second snippet: <code>{command}</code> (needs Node.js) connects to this server and handles the sign-in.",
};
