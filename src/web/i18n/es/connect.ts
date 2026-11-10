import type en from "../en/connect.js";

/** Translations (es): connect. Every key of ../en/connect.ts, the same placeholders and markup. */
export default {
  "connect.title": "Conecta tu app de IA",
  "connect.intro":
    "MCP for PADI funciona con cualquier app de IA compatible con servidores MCP: Claude, ChatGPT, Gemini, Codex, Cursor, VS Code y muchas más. Todo el mundo usa la misma dirección e inicia sesión aquí con su propia cuenta. Elige tu app para ver los pasos.",
  "connect.group.chat": "Asistentes de chat",
  "connect.group.code": "Herramientas de programación",
  "connect.group.desktop": "Apps de escritorio y autoalojadas",
  "connect.group.other": "Todo lo demás",
  "connect.signIn": "Inicia sesión aquí como <strong>{email}</strong> y haz clic en <strong>Permitir</strong>.",
  "connect.link.addTo": "Añadir a {app}",
  "connect.link.installIn": "Instalar en {app}",
  "connect.link.open": "Abrir {app}",
  "connect.copy.runInTerminal": "Ejecuta en una ventana de terminal",
  "connect.copy.thenSignIn": "Después, inicia sesión",
  "connect.copy.orRun": "O ejecuta",
  "connect.copy.addToFile": "Añade a {file}",
  "connect.copy.orAddToFile": "O añade a {file}",
  "connect.claude.hint": "claude.ai, la app de escritorio y las apps móviles",
  "connect.claude.step1":
    "Haz clic en <strong>{button}</strong>. Se abre Claude con el nombre y la dirección ya rellenados. (O abre <strong>Customize &gt; Connectors &gt; Add custom connector</strong> y pega la dirección).",
  "connect.claude.step2": "Deja los valores predeterminados (\"Use Claude's published identity\") y haz clic en <strong>Add</strong> y después en <strong>Connect</strong>.",
  "connect.claude.step4":
    "En un chat, activa MCP for PADI con <strong>+ &gt; Connectors</strong>. Funciona en la web, en el escritorio y en el teléfono (añádelo primero en la web o en el escritorio).",
  "connect.claude.note":
    "Los planes gratuitos pueden añadir un conector personalizado. En los planes Team y Enterprise, un propietario lo añade una sola vez en <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Organization settings &gt; Connectors</a> y, después, cada miembro hace clic en Connect e inicia sesión con su propia cuenta.",
  "connect.chatgpt.hint": "chatgpt.com (se añade en la web y después se puede usar en todas partes)",
  "connect.chatgpt.link": "Abrir plugins de ChatGPT",
  "connect.chatgpt.step1": "En chatgpt.com, abre <strong>Plugins</strong>, haz clic en <strong>+</strong> y elige <strong>Add custom MCP server</strong>.",
  "connect.chatgpt.step2":
    "Ponle el nombre \"MCP for PADI\", pega la dirección de arriba como <strong>Server URL</strong> y elige <strong>OAuth</strong> como autenticación. Confirma el aviso y créalo.",
  "connect.chatgpt.step3": "Abre tus plugins y añade MCP for PADI. {signIn}",
  "connect.chatgpt.step4": "En un chat, escribe <strong>@</strong> y elige MCP for PADI.",
  "connect.chatgpt.note":
    "Los servidores MCP personalizados dependen de tu plan de ChatGPT y de los ajustes de tu espacio de trabajo. En algunos planes personales, ChatGPT solo permite la lectura, así que puede que no puedas registrar ni modificar inmersiones.",
  "connect.gemini.hint": "gemini.google.com (cuentas personales de Google en EE. UU.)",
  "connect.gemini.step1":
    "En un equipo, abre <strong>Settings &gt; Connected Apps</strong> y, en <strong>Custom apps</strong>, haz clic en <strong>Add a custom app</strong>.",
  "connect.gemini.step2": "Pega la dirección, haz clic en <strong>Next</strong> e inicia sesión. {signIn}",
  "connect.gemini.step3": "Una vez añadida en la web, también funciona en la app móvil de Gemini.",
  "connect.leChat.step1": "Abre el panel lateral, <strong>Intelligence &gt; Connectors &gt; Add Connector</strong>, pestaña <strong>Custom MCP Connector</strong>.",
  "connect.leChat.step2": "Ponle el nombre <code>{name}</code> (sin espacios), pega la dirección y haz clic en <strong>Connect</strong>. {signIn}",
  "connect.leChat.note": "En los planes de equipo, solo un administrador puede añadir conectores.",
  "connect.perplexity.hint": "web y app para Mac, Pro, Max y Enterprise",
  "connect.perplexity.step1":
    "Abre <strong>Plugins</strong> (o <strong>Settings &gt; Connectors</strong>) y luego <strong>Add custom &gt; Add MCP connector &gt; Remote</strong>.",
  "connect.perplexity.step2":
    "Ponle el nombre \"MCP for PADI\" y pega la dirección. En <strong>Advanced</strong>, elige <strong>OAuth</strong> y <strong>Streamable HTTP</strong>. Guarda, actívalo e inicia sesión. {signIn}",
  "connect.claudeCode.hint": "terminal, VS Code y JetBrains",
  "connect.claudeCode.step1": "Ejecuta los dos comandos (o escribe <code>{command}</code> en Claude Code). Se abre un navegador. {signIn}",
  "connect.claudeCode.note": "¿Ya has añadido MCP for PADI en claude.ai? Claude Code, con la sesión iniciada en la misma cuenta de Claude, lo muestra automáticamente.",
  "connect.codex.hint": "el agente de programación de OpenAI: terminal, extensión para IDE, app de escritorio de ChatGPT",
  "connect.codex.step1": "Ejecuta el comando. Codex abre un navegador. {signIn}",
  "connect.codex.step2":
    "En la extensión para IDE o en la app de escritorio también puedes usar <strong>Settings &gt; MCP servers &gt; Add server</strong>, elegir <strong>Streamable HTTP</strong>, pegar la dirección y hacer clic en <strong>Authenticate</strong>. Todas comparten los mismos ajustes.",
  "connect.cursor.hint": "el editor y su comando de agente",
  "connect.cursor.step1": "Haz clic en <strong>{button}</strong> y confirma con <strong>Install</strong> en Cursor.",
  "connect.cursor.step2": "Cursor te pide que inicies sesión la primera vez que usa MCP for PADI (desde la línea de comandos: <code>{command}</code>). {signIn}",
  "connect.vscode.hint": "GitHub Copilot en modo agente",
  "connect.vscode.step1": "Haz clic en <strong>{button}</strong> y confirma con <strong>Install</strong> en VS Code.",
  "connect.vscode.step2": "Inicia el servidor cuando VS Code te lo pida. Se abre un navegador. {signIn}",
  "connect.vscode.step3": "Úsalo en Copilot Chat en el modo <strong>Agent</strong>.",
  "connect.vscode.note": "Copilot Business y Enterprise: un administrador tiene que permitir los servidores MCP.",
  "connect.visualStudio.hint": "Visual Studio 2026 o 2022 17.14, GitHub Copilot",
  "connect.visualStudio.step1": "Haz clic en <strong>{button}</strong> y confirma.",
  "connect.visualStudio.step2": "En el archivo <code>{file}</code>, haz clic en <strong>Authentication Required</strong>, encima del servidor. {signIn}",
  "connect.copilotCli.hint": "el comando copilot",
  "connect.copilotCli.step1": "Ejecuta el comando. Cuando Copilot te pida que inicies sesión (o después de <code>{command}</code>), se abre un navegador. {signIn}",
  "connect.geminiCli.hint": "el agente de línea de comandos de Google",
  "connect.geminiCli.step1": "Ejecuta el comando. La primera vez que Gemini CLI usa MCP for PADI, abre un navegador. {signIn}",
  "connect.windsurf.hint": "Devin Local, Devin CLI y el antiguo Cascade",
  "connect.windsurf.step1": "Ejecuta los dos comandos. Devin Desktop lee los mismos ajustes. {signIn}",
  "connect.windsurf.step2":
    "Editor Windsurf antiguo: en Cascade, abre el menú MCP, <strong>Open MCP config file</strong>, añade <code>{snippet}</code> en <code>{key}</code> y actualiza.",
  "connect.windsurf.note": "En los planes Enterprise, un administrador tiene que permitir los servidores MCP.",
  "connect.zed.hint": "el agente del editor Zed",
  "connect.zed.step1":
    "Abre <strong>Settings &gt; AI &gt; MCP Servers &gt; Add Server &gt; Add Remote Server</strong> y pega la dirección, o añade el fragmento a tu archivo de ajustes.",
  "connect.zed.step2": "Haz clic en <strong>Authenticate</strong> cuando Zed te lo pida. {signIn}",
  "connect.jetbrains.name": "IDE de JetBrains",
  "connect.jetbrains.hint": "Junie y AI Assistant en IntelliJ IDEA, PyCharm, WebStorm y otros",
  "connect.jetbrains.copyAiAssistant": "AI Assistant: si no se abre el inicio de sesión",
  "connect.jetbrains.step1":
    "<strong>Junie</strong>: añade el primer fragmento (o, en Junie CLI, escribe <code>{command}</code> y añade un servidor remoto) y después elige <strong>Authorize</strong>. {signIn}",
  "connect.jetbrains.step2":
    "<strong>AI Assistant</strong>: <strong>Settings &gt; Tools &gt; AI Assistant &gt; Model Context Protocol (MCP) &gt; Add &gt; JSON configuration</strong>, pega un fragmento y después haz clic en <strong>OK</strong> y <strong>Apply</strong>.",
  "connect.kiro.hint": "IDE, CLI y web",
  "connect.kiro.step1": "Haz clic en <strong>{button}</strong> y confirma en Kiro. Kiro abre el inicio de sesión automáticamente. {signIn}",
  "connect.cline.hint": "extensión para VS Code y JetBrains, Cline CLI",
  "connect.cline.step1":
    "Ejecuta el comando o, en el panel de Cline, abre <strong>MCP Servers &gt; Remote Servers</strong>, introduce el nombre y la dirección y elige <strong>Streamable HTTP</strong>.",
  "connect.cline.step2": "Aprueba el inicio de sesión cuando Cline te lo pida. {signIn}",
  "connect.warp.hint": "los agentes de la app de terminal",
  "connect.warp.copy": "Pega en Settings > Agents > MCP servers > + Add",
  "connect.warp.step1": "Pega el fragmento, haz clic en <strong>Start</strong> y completa el inicio de sesión en el navegador. {signIn}",
  "connect.raycast.hint": "Mac, Windows y iPhone, Raycast Pro",
  "connect.raycast.step1":
    "Ejecuta <strong>Install MCP Server</strong>. Nombre \"MCP for PADI\", Transport <strong>HTTP</strong>, pega la dirección, OAuth type <strong>Dynamic</strong> y después <strong>Install</strong>.",
  "connect.raycast.step2": "Haz clic en <strong>Sign In</strong>. {signIn}",
  "connect.lmStudio.hint": "modelos locales, versión 0.4.10 o posterior",
  "connect.lmStudio.copy": "O añade a {file} (pestaña Program > Install > Edit {file})",
  "connect.lmStudio.step1": "Haz clic en <strong>{button}</strong> (con LM Studio instalado) y confirma. Después, inicia sesión en el navegador. {signIn}",
  "connect.lmStudio.note": "Usa un modelo compatible con llamadas a herramientas.",
  "connect.goose.hint": "goose Desktop y CLI",
  "connect.goose.step1": "Haz clic en <strong>{button}</strong> (con goose Desktop instalado) y confirma. Goose abre el inicio de sesión automáticamente. {signIn}",
  "connect.goose.step2":
    "CLI: <code>{command}</code> &gt; <strong>Add Extension</strong> &gt; <strong>Remote Extension (Streamable HTTP)</strong> y pega la dirección.",
  "connect.jan.hint": "Jan Desktop y Jan CLI",
  "connect.jan.step1":
    "Ejecuta el comando o, en Jan Desktop, abre <strong>Settings &gt; MCP Servers &gt; Add MCP Server</strong>, elige el transporte <strong>HTTP</strong> y pega la dirección.",
  "connect.jan.step2": "Usa la acción <strong>Sign in</strong> del servidor. {signIn}",
  "connect.msty.hint": "app de escritorio",
  "connect.msty.step1":
    "<strong>Toolbox &gt; Tools &gt; Add New Tool</strong>, nombre \"MCP for PADI\", elige <strong>HTTP</strong>, pega la dirección y elige <strong>OAuth</strong>.",
  "connect.msty.step2": "Haz clic en <strong>Test tool</strong>, inicia sesión y después haz clic en <strong>Save</strong>. {signIn}",
  "connect.openWebui.hint": "autoalojado, versión 0.6.31 o posterior, lo añade un administrador",
  "connect.openWebui.step1":
    "Administrador: <strong>Settings &gt; Admin &gt; Integrations &gt; External Tool Servers &gt; Add Connection</strong>, tipo <strong>MCP (Streamable HTTP)</strong>, pega la dirección, autenticación <strong>OAuth 2.1</strong>, haz clic en <strong>Register Client</strong> y guarda.",
  "connect.openWebui.step2": "Cada persona: en un chat, <strong>+ &gt; Integrations &gt; Tools</strong>, activa MCP for PADI e inicia sesión. {signIn}",
  "connect.librechat.hint": "autoalojado",
  "connect.librechat.copy": "{file} (administrador)",
  "connect.librechat.step1":
    "Añádelo a <code>{file}</code> y reinicia, o en el panel lateral usa <strong>MCP Settings &gt; Add MCP</strong> con el transporte <strong>Streamable HTTPS</strong>.",
  "connect.librechat.step2": "Haz clic en <strong>Connect</strong> y después en <strong>Continue with OAuth</strong>. {signIn}",
  "connect.n8n.hint": "flujos de trabajo con AI Agent",
  "connect.n8n.step1":
    "En un nodo <strong>AI Agent</strong>, añade <strong>MCP Client Tool</strong>. Endpoint: la dirección, transporte <strong>HTTP Streamable</strong>.",
  "connect.n8n.step2":
    "Autenticación <strong>MCP OAuth2</strong>: crea una credencial (deja activado \"Use Dynamic Client Registration\") y conecta. {signIn}",
  "connect.other.name": "Otras apps de IA",
  "connect.other.hint": "cualquier app compatible con servidores MCP remotos",
  "connect.other.copyJson": "La mayoría de las apps (JSON)",
  "connect.other.copyLocal": "Apps que solo ejecutan servidores locales",
  "connect.other.step1":
    "Busca <strong>Add MCP server</strong> o \"Añadir servidor MCP\" (a veces \"conector personalizado\" o \"herramientas\") y usa la dirección de arriba. Si te lo pide, elige <strong>HTTP</strong> o <strong>Streamable HTTP</strong>.",
  "connect.other.step2": "El inicio de sesión usa OAuth: la app abre este sitio. {signIn} No hace falta poner ninguna clave de API ni contraseña en la app.",
  "connect.other.step3":
    "Si la app solo puede iniciar programas locales o no puede iniciar sesión en servidores remotos (por ejemplo, Roo Code y Continue), usa el segundo fragmento: <code>{command}</code> (requiere Node.js) se conecta a este servidor y gestiona el inicio de sesión.",
} satisfies Record<keyof typeof en, string>;
