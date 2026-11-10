import type en from "../en/connect.js";

/** Translations (de): connect. Every key of ../en/connect.ts, the same placeholders and markup. */
export default {
  "connect.title": "KI-App verbinden",
  "connect.intro":
    "MCP for PADI funktioniert mit jeder KI-App, die MCP-Server unterstützt: Claude, ChatGPT, Gemini, Codex, Cursor, VS Code und vielen mehr. Alle verwenden dieselbe Adresse und melden sich hier mit ihrem eigenen Account an. Wähle deine App, um die Schritte zu sehen.",

  "connect.group.chat": "Chat-Assistenten",
  "connect.group.code": "Entwicklertools",
  "connect.group.desktop": "Desktop- und selbst gehostete Apps",
  "connect.group.other": "Alles andere",

  "connect.signIn": "Melde dich hier als <strong>{email}</strong> an und klicke auf <strong>Erlauben</strong>.",
  "connect.link.addTo": "Zu {app} hinzufügen",
  "connect.link.installIn": "In {app} installieren",
  "connect.link.open": "{app} öffnen",
  "connect.copy.runInTerminal": "Im Terminal ausführen",
  "connect.copy.thenSignIn": "Dann anmelden",
  "connect.copy.orRun": "Oder ausführen",
  "connect.copy.addToFile": "Zu {file} hinzufügen",
  "connect.copy.orAddToFile": "Oder zu {file} hinzufügen",

  "connect.claude.hint": "claude.ai, die Desktop-App und die mobilen Apps",
  "connect.claude.step1":
    "Klicke auf <strong>{button}</strong>. Claude öffnet sich, Name und Adresse sind bereits ausgefüllt. (Oder öffne <strong>Customize &gt; Connectors &gt; Add custom connector</strong> und füge die Adresse ein.)",
  "connect.claude.step2": "Behalte die Standardeinstellungen („Use Claude's published identity“) bei und klicke auf <strong>Add</strong> und dann auf <strong>Connect</strong>.",
  "connect.claude.step4":
    "Aktiviere MCP for PADI in einem Chat über <strong>+ &gt; Connectors</strong>. Das funktioniert im Web, auf dem Desktop und auf dem Smartphone (füge es zuerst im Web oder auf dem Desktop hinzu).",
  "connect.claude.note":
    "Im kostenlosen Plan kannst du nur einen eigenen Connector hinzufügen. In Team- und Enterprise-Plänen fügt ein Owner ihn einmal unter <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Organization settings &gt; Connectors</a> hinzu. Danach klickt jedes Mitglied auf Connect und meldet sich mit seinem eigenen Account an.",

  "connect.chatgpt.hint": "chatgpt.com (im Web hinzufügen, dann überall nutzbar)",
  "connect.chatgpt.link": "ChatGPT-Plugins öffnen",
  "connect.chatgpt.step1": "Öffne auf chatgpt.com <strong>Plugins</strong>, klicke auf <strong>+</strong> und wähle <strong>Add custom MCP server</strong>.",
  "connect.chatgpt.step2":
    "Gib als Namen „MCP for PADI“ ein, füge die Adresse von oben als <strong>Server URL</strong> ein und wähle <strong>OAuth</strong> für die Authentifizierung. Bestätige die Warnung und erstelle den Server.",
  "connect.chatgpt.step3": "Öffne deine Plugins und füge MCP for PADI hinzu. {signIn}",
  "connect.chatgpt.step4": "Gib in einem Chat <strong>@</strong> ein und wähle MCP for PADI.",
  "connect.chatgpt.note":
    "Ob eigene MCP-Server möglich sind, hängt von deinem ChatGPT-Plan und den Workspace-Einstellungen ab. In einigen privaten Plänen erlaubt ChatGPT nur Lesezugriff, sodass das Eintragen oder Ändern von Tauchgängen dort blockiert sein kann.",

  "connect.gemini.hint": "gemini.google.com (private Google-Konten in den USA)",
  "connect.gemini.step1":
    "Öffne auf einem Computer <strong>Settings &gt; Connected Apps</strong> und klicke dann unter <strong>Custom apps</strong> auf <strong>Add a custom app</strong>.",
  "connect.gemini.step2": "Füge die Adresse ein, klicke auf <strong>Next</strong> und melde dich an. {signIn}",
  "connect.gemini.step3": "Sobald es im Web hinzugefügt ist, funktioniert es auch in der mobilen Gemini-App.",

  "connect.leChat.step1": "Öffne in der Seitenleiste <strong>Intelligence &gt; Connectors &gt; Add Connector</strong> und dort den Tab <strong>Custom MCP Connector</strong>.",
  "connect.leChat.step2": "Gib als Namen <code>{name}</code> ein (ohne Leerzeichen), füge die Adresse ein und klicke auf <strong>Connect</strong>. {signIn}",
  "connect.leChat.note": "In Team-Plänen können nur Administratoren Connectors hinzufügen.",

  "connect.perplexity.hint": "Web und Mac-App, Pro, Max und Enterprise",
  "connect.perplexity.step1":
    "Öffne <strong>Plugins</strong> (oder <strong>Settings &gt; Connectors</strong>) und dann <strong>Add custom &gt; Add MCP connector &gt; Remote</strong>.",
  "connect.perplexity.step2":
    "Gib als Namen „MCP for PADI“ ein und füge die Adresse ein. Wähle unter <strong>Advanced</strong> die Optionen <strong>OAuth</strong> und <strong>Streamable HTTP</strong>. Speichere, aktiviere den Connector und melde dich an. {signIn}",

  "connect.claudeCode.hint": "Terminal, VS Code und JetBrains",
  "connect.claudeCode.step1": "Führe die beiden Befehle aus (oder gib <code>{command}</code> in Claude Code ein). Ein Browser öffnet sich. {signIn}",
  "connect.claudeCode.note": "Hast du MCP for PADI schon auf claude.ai hinzugefügt? Dann zeigt Claude Code es automatisch an, wenn du mit demselben Claude-Account angemeldet bist.",

  "connect.codex.hint": "der Coding-Agent von OpenAI: Terminal, IDE-Erweiterung, ChatGPT-Desktop-App",
  "connect.codex.step1": "Führe den Befehl aus. Codex öffnet einen Browser. {signIn}",
  "connect.codex.step2":
    "In der IDE-Erweiterung oder der Desktop-App kannst du auch <strong>Settings &gt; MCP servers &gt; Add server</strong> verwenden, <strong>Streamable HTTP</strong> wählen, die Adresse einfügen und auf <strong>Authenticate</strong> klicken. Alle nutzen dieselben Einstellungen.",

  "connect.cursor.hint": "der Editor und sein Agent-Befehl",
  "connect.cursor.step1": "Klicke auf <strong>{button}</strong> und bestätige in Cursor mit <strong>Install</strong>.",
  "connect.cursor.step2": "Cursor fordert dich zur Anmeldung auf, wenn es MCP for PADI zum ersten Mal verwendet (im Terminal: <code>{command}</code>). {signIn}",

  "connect.vscode.hint": "GitHub Copilot im Agent-Modus",
  "connect.vscode.step1": "Klicke auf <strong>{button}</strong> und bestätige in VS Code mit <strong>Install</strong>.",
  "connect.vscode.step2": "Starte den Server, wenn VS Code danach fragt. Ein Browser öffnet sich. {signIn}",
  "connect.vscode.step3": "Nutze ihn in Copilot Chat im Modus <strong>Agent</strong>.",
  "connect.vscode.note": "Copilot Business und Enterprise: Ein Administrator muss MCP-Server erlauben.",

  "connect.visualStudio.hint": "Visual Studio 2026 oder 2022 17.14, GitHub Copilot",
  "connect.visualStudio.step1": "Klicke auf <strong>{button}</strong> und bestätige.",
  "connect.visualStudio.step2": "Klicke in der Datei <code>{file}</code> über dem Server auf <strong>Authentication Required</strong>. {signIn}",

  "connect.copilotCli.hint": "der Befehl copilot",
  "connect.copilotCli.step1": "Führe den Befehl aus. Wenn Copilot dich zur Anmeldung auffordert (oder nach <code>{command}</code>), öffnet sich ein Browser. {signIn}",

  "connect.geminiCli.hint": "der Kommandozeilen-Agent von Google",
  "connect.geminiCli.step1": "Führe den Befehl aus. Wenn Gemini CLI MCP for PADI zum ersten Mal verwendet, öffnet es einen Browser. {signIn}",

  "connect.windsurf.hint": "Devin Local, Devin CLI und das ältere Cascade",
  "connect.windsurf.step1": "Führe die beiden Befehle aus. Devin Desktop liest dieselben Einstellungen. {signIn}",
  "connect.windsurf.step2":
    "Älterer Windsurf-Editor: Öffne in Cascade das MCP-Menü, wähle <strong>Open MCP config file</strong>, füge <code>{snippet}</code> unter <code>{key}</code> hinzu und aktualisiere.",
  "connect.windsurf.note": "In Enterprise-Plänen muss ein Administrator MCP-Server erlauben.",

  "connect.zed.hint": "der Agent des Zed-Editors",
  "connect.zed.step1":
    "Öffne <strong>Settings &gt; AI &gt; MCP Servers &gt; Add Server &gt; Add Remote Server</strong> und füge die Adresse ein, oder füge das Snippet zu deiner Einstellungsdatei hinzu.",
  "connect.zed.step2": "Klicke auf <strong>Authenticate</strong>, wenn Zed danach fragt. {signIn}",

  "connect.jetbrains.name": "JetBrains-IDEs",
  "connect.jetbrains.hint": "Junie und AI Assistant in IntelliJ IDEA, PyCharm, WebStorm und weiteren",
  "connect.jetbrains.copyAiAssistant": "AI Assistant: falls sich keine Anmeldung öffnet",
  "connect.jetbrains.step1":
    "<strong>Junie</strong>: Füge das erste Snippet hinzu (oder in Junie CLI: <code>{command}</code>, dann einen Remote-Server hinzufügen) und wähle dann <strong>Authorize</strong>. {signIn}",
  "connect.jetbrains.step2":
    "<strong>AI Assistant</strong>: Öffne <strong>Settings &gt; Tools &gt; AI Assistant &gt; Model Context Protocol (MCP) &gt; Add &gt; JSON configuration</strong>, füge ein Snippet ein und klicke auf <strong>OK</strong> und <strong>Apply</strong>.",

  "connect.kiro.hint": "IDE, CLI und Web",
  "connect.kiro.step1": "Klicke auf <strong>{button}</strong> und bestätige in Kiro. Kiro öffnet die Anmeldung automatisch. {signIn}",

  "connect.cline.hint": "Erweiterung für VS Code und JetBrains, Cline CLI",
  "connect.cline.step1":
    "Führe den Befehl aus, oder öffne im Cline-Panel <strong>MCP Servers &gt; Remote Servers</strong>, gib Namen und Adresse ein und wähle <strong>Streamable HTTP</strong>.",
  "connect.cline.step2": "Bestätige die Anmeldung, wenn Cline danach fragt. {signIn}",

  "connect.warp.hint": "die Agenten des Terminals",
  "connect.warp.copy": "In Settings > Agents > MCP servers > + Add einfügen",
  "connect.warp.step1": "Füge das Snippet ein, klicke auf <strong>Start</strong> und schließe die Anmeldung im Browser ab. {signIn}",

  "connect.raycast.hint": "Mac, Windows und iPhone, Raycast Pro",
  "connect.raycast.step1":
    "Führe <strong>Install MCP Server</strong> aus. Name „MCP for PADI“, Transport <strong>HTTP</strong>, Adresse einfügen, OAuth-Typ <strong>Dynamic</strong>, dann <strong>Install</strong>.",
  "connect.raycast.step2": "Klicke auf <strong>Sign In</strong>. {signIn}",

  "connect.lmStudio.hint": "lokale Modelle, Version 0.4.10 oder neuer",
  "connect.lmStudio.copy": "Oder zu {file} hinzufügen (Tab Program > Install > Edit {file})",
  "connect.lmStudio.step1": "Klicke auf <strong>{button}</strong> (LM Studio muss installiert sein) und bestätige. Melde dich dann im Browser an. {signIn}",
  "connect.lmStudio.note": "Verwende ein Modell, das Tool-Aufrufe unterstützt.",

  "connect.goose.hint": "goose Desktop und CLI",
  "connect.goose.step1": "Klicke auf <strong>{button}</strong> (goose Desktop muss installiert sein) und bestätige. Goose startet die Anmeldung automatisch. {signIn}",
  "connect.goose.step2":
    "CLI: <code>{command}</code> &gt; <strong>Add Extension</strong> &gt; <strong>Remote Extension (Streamable HTTP)</strong>, dann die Adresse einfügen.",

  "connect.jan.hint": "Jan Desktop und Jan CLI",
  "connect.jan.step1":
    "Führe den Befehl aus, oder öffne in Jan Desktop <strong>Settings &gt; MCP Servers &gt; Add MCP Server</strong>, wähle als Transport <strong>HTTP</strong> und füge die Adresse ein.",
  "connect.jan.step2": "Verwende die Aktion <strong>Sign in</strong> des Servers. {signIn}",

  "connect.msty.hint": "Desktop-App",
  "connect.msty.step1":
    "Öffne <strong>Toolbox &gt; Tools &gt; Add New Tool</strong>, gib als Namen „MCP for PADI“ ein, wähle <strong>HTTP</strong>, füge die Adresse ein und wähle <strong>OAuth</strong>.",
  "connect.msty.step2": "Klicke auf <strong>Test tool</strong>, melde dich an und klicke dann auf <strong>Save</strong>. {signIn}",

  "connect.openWebui.hint": "selbst gehostet, Version 0.6.31 oder neuer, wird von einem Administrator hinzugefügt",
  "connect.openWebui.step1":
    "Administrator: Öffne <strong>Settings &gt; Admin &gt; Integrations &gt; External Tool Servers &gt; Add Connection</strong>, wähle den Typ <strong>MCP (Streamable HTTP)</strong>, füge die Adresse ein, wähle als Auth <strong>OAuth 2.1</strong>, klicke auf <strong>Register Client</strong> und speichere.",
  "connect.openWebui.step2": "Jede Person: Öffne in einem Chat <strong>+ &gt; Integrations &gt; Tools</strong>, aktiviere MCP for PADI und melde dich an. {signIn}",

  "connect.librechat.hint": "selbst gehostet",
  "connect.librechat.copy": "{file} (Administrator)",
  "connect.librechat.step1":
    "Füge es zu <code>{file}</code> hinzu und starte LibreChat neu, oder verwende in der Seitenleiste <strong>MCP Settings &gt; Add MCP</strong> mit dem Transport <strong>Streamable HTTPS</strong>.",
  "connect.librechat.step2": "Klicke auf <strong>Connect</strong> und dann auf <strong>Continue with OAuth</strong>. {signIn}",

  "connect.n8n.hint": "Workflows mit AI Agent",
  "connect.n8n.step1":
    "Füge in einem Node vom Typ <strong>AI Agent</strong> das <strong>MCP Client Tool</strong> hinzu. Endpoint: die Adresse, Transport <strong>HTTP Streamable</strong>.",
  "connect.n8n.step2":
    "Wähle als Authentication <strong>MCP OAuth2</strong>, erstelle ein Credential (lass „Use Dynamic Client Registration“ eingeschaltet) und verbinde. {signIn}",

  "connect.other.name": "Andere KI-Apps",
  "connect.other.hint": "jede App, die Remote-MCP-Server unterstützt",
  "connect.other.copyJson": "Die meisten Apps (JSON)",
  "connect.other.copyLocal": "Apps, die nur lokale Server ausführen",
  "connect.other.step1":
    "Suche nach <strong>Add MCP server</strong> (manchmal „Custom Connector“ oder „Tools“) und verwende die Adresse von oben. Wähle <strong>HTTP</strong> oder <strong>Streamable HTTP</strong>, falls danach gefragt wird.",
  "connect.other.step2": "Die Anmeldung läuft über OAuth: Die App öffnet diese Website. {signIn} Du gibst in der App weder einen API-Schlüssel noch ein Passwort ein.",
  "connect.other.step3":
    "Wenn die App nur lokale Programme starten oder sich nicht bei Remote-Servern anmelden kann (zum Beispiel Roo Code und Continue), verwende das zweite Snippet: <code>{command}</code> (benötigt Node.js) verbindet sich mit diesem Server und übernimmt die Anmeldung.",
} satisfies Record<keyof typeof en, string>;
