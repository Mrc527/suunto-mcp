import type en from "../en/connect.js";

/** Translations (it): connect. Every key of ../en/connect.ts, the same placeholders and markup. */
export default {
  "connect.title": "Collega la tua app di IA",
  "connect.intro":
    "MCP for PADI funziona con qualsiasi app di IA che supporta i server MCP: Claude, ChatGPT, Gemini, Codex, Cursor, VS Code e molte altre. Tutti usano lo stesso indirizzo e accedono qui con il proprio account. Scegli la tua app per vedere i passaggi.",

  "connect.group.chat": "Assistenti di chat",
  "connect.group.code": "Strumenti per programmare",
  "connect.group.desktop": "App desktop e self-hosted",
  "connect.group.other": "Altro",

  "connect.signIn": "Accedi qui come <strong>{email}</strong> e fai clic su <strong>Consenti</strong>.",
  "connect.link.addTo": "Aggiungi a {app}",
  "connect.link.installIn": "Installa in {app}",
  "connect.link.open": "Apri {app}",
  "connect.copy.runInTerminal": "Esegui in un terminale",
  "connect.copy.thenSignIn": "Poi accedi",
  "connect.copy.orRun": "Oppure esegui",
  "connect.copy.addToFile": "Aggiungi a {file}",
  "connect.copy.orAddToFile": "Oppure aggiungi a {file}",

  "connect.claude.hint": "claude.ai, l'app desktop e le app per dispositivi mobili",
  "connect.claude.step1":
    "Fai clic su <strong>{button}</strong>. Si apre Claude con nome e indirizzo già compilati. (Oppure apri <strong>Customize &gt; Connectors &gt; Add custom connector</strong> e incolla l'indirizzo.)",
  "connect.claude.step2": "Lascia le impostazioni predefinite (“Use Claude's published identity”) e fai clic su <strong>Add</strong>, poi su <strong>Connect</strong>.",
  "connect.claude.step4":
    "In una chat, attiva MCP for PADI con <strong>+ &gt; Connectors</strong>. Funziona sul web, sul desktop e sul telefono (aggiungilo prima sul web o sul desktop).",
  "connect.claude.note":
    "Con il piano Free puoi aggiungere un solo connettore personalizzato. Nei piani Team ed Enterprise un proprietario lo aggiunge una sola volta in <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Organization settings &gt; Connectors</a>, poi ogni membro fa clic su Connect e accede con il proprio account.",

  "connect.chatgpt.hint": "chatgpt.com (si aggiunge sul web, poi funziona ovunque)",
  "connect.chatgpt.link": "Apri i plugin di ChatGPT",
  "connect.chatgpt.step1": "Su chatgpt.com apri <strong>Plugins</strong>, fai clic su <strong>+</strong> e scegli <strong>Add custom MCP server</strong>.",
  "connect.chatgpt.step2":
    "Chiamalo “MCP for PADI”, incolla l'indirizzo qui sopra come <strong>Server URL</strong> e scegli <strong>OAuth</strong> per l'autenticazione. Conferma l'avviso e crealo.",
  "connect.chatgpt.step3": "Apri i tuoi plugin e aggiungi MCP for PADI. {signIn}",
  "connect.chatgpt.step4": "In una chat, digita <strong>@</strong> e scegli MCP for PADI.",
  "connect.chatgpt.note":
    "I server MCP personalizzati dipendono dal tuo piano ChatGPT e dalle impostazioni del workspace. Con alcuni piani personali ChatGPT consente solo la lettura, quindi lì la registrazione o la modifica di immersioni potrebbero essere bloccate.",

  "connect.gemini.hint": "gemini.google.com (account Google personali negli Stati Uniti)",
  "connect.gemini.step1":
    "Su un computer apri <strong>Settings &gt; Connected Apps</strong>, poi in <strong>Custom apps</strong> fai clic su <strong>Add a custom app</strong>.",
  "connect.gemini.step2": "Incolla l'indirizzo, fai clic su <strong>Next</strong> e accedi. {signIn}",
  "connect.gemini.step3": "Una volta aggiunto sul web, funziona anche nell'app Gemini per dispositivi mobili.",

  "connect.leChat.step1": "Apri il pannello laterale, <strong>Intelligence &gt; Connectors &gt; Add Connector</strong>, scheda <strong>Custom MCP Connector</strong>.",
  "connect.leChat.step2": "Chiamalo <code>{name}</code> (senza spazi), incolla l'indirizzo e fai clic su <strong>Connect</strong>. {signIn}",
  "connect.leChat.note": "Nei piani per team solo un amministratore può aggiungere connettori.",

  "connect.perplexity.hint": "web e app per Mac, Pro, Max ed Enterprise",
  "connect.perplexity.step1":
    "Apri <strong>Plugins</strong> (oppure <strong>Settings &gt; Connectors</strong>), <strong>Add custom &gt; Add MCP connector &gt; Remote</strong>.",
  "connect.perplexity.step2":
    "Nome “MCP for PADI”, incolla l'indirizzo. In <strong>Advanced</strong> scegli <strong>OAuth</strong> e <strong>Streamable HTTP</strong>. Salva, attivalo e accedi. {signIn}",

  "connect.claudeCode.hint": "terminale, VS Code e JetBrains",
  "connect.claudeCode.step1": "Esegui i due comandi (oppure digita <code>{command}</code> in Claude Code). Si apre un browser. {signIn}",
  "connect.claudeCode.note": "Hai già aggiunto MCP for PADI su claude.ai? Se in Claude Code hai eseguito l'accesso con lo stesso account Claude, compare automaticamente.",

  "connect.codex.hint": "l'agente di programmazione di OpenAI: terminale, estensione per IDE, app desktop di ChatGPT",
  "connect.codex.step1": "Esegui il comando. Codex apre un browser. {signIn}",
  "connect.codex.step2":
    "Nell'estensione per IDE o nell'app desktop puoi anche usare <strong>Settings &gt; MCP servers &gt; Add server</strong>, scegliere <strong>Streamable HTTP</strong>, incollare l'indirizzo e fare clic su <strong>Authenticate</strong>. Tutte condividono le stesse impostazioni.",

  "connect.cursor.hint": "l'editor e il suo comando agent",
  "connect.cursor.step1": "Fai clic su <strong>{button}</strong> e conferma con <strong>Install</strong> in Cursor.",
  "connect.cursor.step2": "Cursor ti chiede di accedere la prima volta che usa MCP for PADI (nel terminale: <code>{command}</code>). {signIn}",

  "connect.vscode.hint": "GitHub Copilot in modalità agente",
  "connect.vscode.step1": "Fai clic su <strong>{button}</strong> e conferma con <strong>Install</strong> in VS Code.",
  "connect.vscode.step2": "Avvia il server quando VS Code lo chiede. Si apre un browser. {signIn}",
  "connect.vscode.step3": "Usalo in Copilot Chat in modalità <strong>Agent</strong>.",
  "connect.vscode.note": "Copilot Business ed Enterprise: un amministratore deve consentire i server MCP.",

  "connect.visualStudio.hint": "Visual Studio 2026 o 2022 17.14, GitHub Copilot",
  "connect.visualStudio.step1": "Fai clic su <strong>{button}</strong> e conferma.",
  "connect.visualStudio.step2": "Nel file <code>{file}</code>, fai clic su <strong>Authentication Required</strong> sopra il server. {signIn}",

  "connect.copilotCli.hint": "il comando copilot",
  "connect.copilotCli.step1": "Esegui il comando. Quando Copilot ti chiede di accedere (o dopo <code>{command}</code>), si apre un browser. {signIn}",

  "connect.geminiCli.hint": "l'agente a riga di comando di Google",
  "connect.geminiCli.step1": "Esegui il comando. La prima volta che Gemini CLI usa MCP for PADI, apre un browser. {signIn}",

  "connect.windsurf.hint": "Devin Local, Devin CLI e il vecchio Cascade",
  "connect.windsurf.step1": "Esegui i due comandi. Devin Desktop legge le stesse impostazioni. {signIn}",
  "connect.windsurf.step2":
    "Vecchio editor Windsurf: in Cascade apri il menu MCP, <strong>Open MCP config file</strong>, aggiungi <code>{snippet}</code> sotto <code>{key}</code> e aggiorna.",
  "connect.windsurf.note": "Nei piani Enterprise un amministratore deve consentire i server MCP.",

  "connect.zed.hint": "l'agente dell'editor Zed",
  "connect.zed.step1":
    "Apri <strong>Settings &gt; AI &gt; MCP Servers &gt; Add Server &gt; Add Remote Server</strong> e incolla l'indirizzo, oppure aggiungi lo snippet al tuo file delle impostazioni.",
  "connect.zed.step2": "Fai clic su <strong>Authenticate</strong> quando Zed lo chiede. {signIn}",

  "connect.jetbrains.name": "IDE JetBrains",
  "connect.jetbrains.hint": "Junie e AI Assistant in IntelliJ IDEA, PyCharm, WebStorm e altri",
  "connect.jetbrains.copyAiAssistant": "AI Assistant: se non si apre una pagina di accesso",
  "connect.jetbrains.step1":
    "<strong>Junie</strong>: aggiungi il primo snippet (oppure in Junie CLI: <code>{command}</code>, poi aggiungi un server remoto), quindi scegli <strong>Authorize</strong>. {signIn}",
  "connect.jetbrains.step2":
    "<strong>AI Assistant</strong>: <strong>Settings &gt; Tools &gt; AI Assistant &gt; Model Context Protocol (MCP) &gt; Add &gt; JSON configuration</strong>, incolla uno snippet, poi <strong>OK</strong> e <strong>Apply</strong>.",

  "connect.kiro.hint": "IDE, CLI e web",
  "connect.kiro.step1": "Fai clic su <strong>{button}</strong> e conferma in Kiro. Kiro apre automaticamente la pagina di accesso. {signIn}",

  "connect.cline.hint": "estensione per VS Code e JetBrains, Cline CLI",
  "connect.cline.step1":
    "Esegui il comando, oppure nel pannello di Cline apri <strong>MCP Servers &gt; Remote Servers</strong>, inserisci nome e indirizzo e scegli <strong>Streamable HTTP</strong>.",
  "connect.cline.step2": "Approva l'accesso quando Cline lo chiede. {signIn}",

  "connect.warp.hint": "gli agenti del terminale",
  "connect.warp.copy": "Incolla in Settings > Agents > MCP servers > + Add",
  "connect.warp.step1": "Incolla lo snippet, fai clic su <strong>Start</strong> e completa l'accesso nel browser. {signIn}",

  "connect.raycast.hint": "Mac, Windows e iPhone, Raycast Pro",
  "connect.raycast.step1":
    "Esegui <strong>Install MCP Server</strong>. Nome “MCP for PADI”, Transport <strong>HTTP</strong>, incolla l'indirizzo, OAuth type <strong>Dynamic</strong>, poi <strong>Install</strong>.",
  "connect.raycast.step2": "Fai clic su <strong>Sign In</strong>. {signIn}",

  "connect.lmStudio.hint": "modelli locali, versione 0.4.10 o successiva",
  "connect.lmStudio.copy": "Oppure aggiungi a {file} (scheda Program > Install > Edit {file})",
  "connect.lmStudio.step1": "Fai clic su <strong>{button}</strong> (con LM Studio installato) e conferma. Poi accedi nel browser. {signIn}",
  "connect.lmStudio.note": "Usa un modello che supporta le chiamate agli strumenti.",

  "connect.goose.hint": "goose Desktop e CLI",
  "connect.goose.step1": "Fai clic su <strong>{button}</strong> (con goose Desktop installato) e conferma. Goose avvia l'accesso automaticamente. {signIn}",
  "connect.goose.step2":
    "CLI: <code>{command}</code> &gt; <strong>Add Extension</strong> &gt; <strong>Remote Extension (Streamable HTTP)</strong>, poi incolla l'indirizzo.",

  "connect.jan.hint": "Jan Desktop e Jan CLI",
  "connect.jan.step1":
    "Esegui il comando, oppure in Jan Desktop apri <strong>Settings &gt; MCP Servers &gt; Add MCP Server</strong>, trasporto <strong>HTTP</strong>, e incolla l'indirizzo.",
  "connect.jan.step2": "Usa l'azione <strong>Sign in</strong> del server. {signIn}",

  "connect.msty.hint": "app desktop",
  "connect.msty.step1":
    "<strong>Toolbox &gt; Tools &gt; Add New Tool</strong>, nome “MCP for PADI”, scegli <strong>HTTP</strong>, incolla l'indirizzo e scegli <strong>OAuth</strong>.",
  "connect.msty.step2": "Fai clic su <strong>Test tool</strong>, accedi, poi fai clic su <strong>Save</strong>. {signIn}",

  "connect.openWebui.hint": "self-hosted, versione 0.6.31 o successiva, aggiunto da un amministratore",
  "connect.openWebui.step1":
    "Amministratore: <strong>Settings &gt; Admin &gt; Integrations &gt; External Tool Servers &gt; Add Connection</strong>, tipo <strong>MCP (Streamable HTTP)</strong>, incolla l'indirizzo, autenticazione <strong>OAuth 2.1</strong>, fai clic su <strong>Register Client</strong> e salva.",
  "connect.openWebui.step2": "Ogni persona: in una chat, <strong>+ &gt; Integrations &gt; Tools</strong>, attiva MCP for PADI e accedi. {signIn}",

  "connect.librechat.hint": "self-hosted",
  "connect.librechat.copy": "{file} (amministratore)",
  "connect.librechat.step1":
    "Aggiungilo a <code>{file}</code> e riavvia, oppure nel pannello laterale usa <strong>MCP Settings &gt; Add MCP</strong> con trasporto <strong>Streamable HTTPS</strong>.",
  "connect.librechat.step2": "Fai clic su <strong>Connect</strong>, poi su <strong>Continue with OAuth</strong>. {signIn}",

  "connect.n8n.hint": "workflow con AI Agent",
  "connect.n8n.step1":
    "In un nodo <strong>AI Agent</strong> aggiungi <strong>MCP Client Tool</strong>. Endpoint: l'indirizzo, trasporto <strong>HTTP Streamable</strong>.",
  "connect.n8n.step2":
    "Autenticazione <strong>MCP OAuth2</strong>, crea una credenziale (lascia attivo “Use Dynamic Client Registration”) e collegati. {signIn}",

  "connect.other.name": "Altre app di IA",
  "connect.other.hint": "qualsiasi app che supporta i server MCP remoti",
  "connect.other.copyJson": "La maggior parte delle app (JSON)",
  "connect.other.copyLocal": "App che eseguono solo server locali",
  "connect.other.step1":
    "Cerca <strong>Add MCP server</strong> (a volte “custom connector” o “tools”) e usa l'indirizzo qui sopra. Se richiesto, scegli <strong>HTTP</strong> o <strong>Streamable HTTP</strong>.",
  "connect.other.step2": "L'accesso usa OAuth: l'app apre questo sito. {signIn} Nell'app non devi inserire chiavi API né password.",
  "connect.other.step3":
    "Se l'app può avviare solo programmi locali o non riesce ad accedere ai server remoti (ad esempio Roo Code e Continue), usa il secondo snippet: <code>{command}</code> (richiede Node.js) si collega a questo server e gestisce l'accesso.",
} satisfies Record<keyof typeof en, string>;
