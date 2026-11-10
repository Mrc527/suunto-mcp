import type en from "../en/connect.js";

/** Translations (zh): connect. Every key of ../en/connect.ts, the same placeholders and markup. */
export default {
  "connect.title": "连接你的 AI 应用",
  "connect.intro":
    "MCP for PADI 适用于任何支持 MCP 服务器的 AI 应用：Claude、ChatGPT、Gemini、Codex、Cursor、VS Code 等众多应用。所有人都使用同一个地址，并在这里用自己的账户登录。选择你的应用以查看操作步骤。",

  "connect.group.chat": "聊天助手",
  "connect.group.code": "编程工具",
  "connect.group.desktop": "桌面和自托管应用",
  "connect.group.other": "其他",

  "connect.signIn": "在这里以 <strong>{email}</strong> 身份登录，然后点击<strong>允许</strong>。",
  "connect.link.addTo": "添加到 {app}",
  "connect.link.installIn": "在 {app} 中安装",
  "connect.link.open": "打开 {app}",
  "connect.copy.runInTerminal": "在终端中运行",
  "connect.copy.thenSignIn": "然后登录",
  "connect.copy.orRun": "或运行",
  "connect.copy.addToFile": "添加到 {file}",
  "connect.copy.orAddToFile": "或添加到 {file}",

  "connect.claude.hint": "claude.ai、桌面应用和移动应用",
  "connect.claude.step1":
    "点击<strong>{button}</strong>。这会打开 Claude，并自动填好名称和地址。（或者打开 <strong>Customize &gt; Connectors &gt; Add custom connector</strong> 并粘贴地址。）",
  "connect.claude.step2": "保留默认设置（“Use Claude's published identity”），点击 <strong>Add</strong>，然后点击 <strong>Connect</strong>。",
  "connect.claude.step4":
    "在聊天中，通过 <strong>+ &gt; Connectors</strong> 打开 MCP for PADI。它可以在网页版、桌面应用和手机上使用（请先在网页版或桌面应用中添加）。",
  "connect.claude.note":
    "免费套餐可以添加一个自定义连接器。在 Team 和 Enterprise 套餐中，由所有者在 <a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">Organization settings &gt; Connectors</a> 中添加一次，然后每位成员点击 Connect 并使用自己的账户登录。",

  "connect.chatgpt.hint": "chatgpt.com（在网页版添加后，即可在各处使用）",
  "connect.chatgpt.link": "打开 ChatGPT 插件",
  "connect.chatgpt.step1": "在 chatgpt.com 上打开 <strong>Plugins</strong>，点击 <strong>+</strong> 并选择 <strong>Add custom MCP server</strong>。",
  "connect.chatgpt.step2":
    "将其命名为“MCP for PADI”，将上方的地址粘贴到 <strong>Server URL</strong>，并选择 <strong>OAuth</strong> 作为认证方式。确认警告并创建。",
  "connect.chatgpt.step3": "打开你的插件并添加 MCP for PADI。{signIn}",
  "connect.chatgpt.step4": "在聊天中输入 <strong>@</strong> 并选择 MCP for PADI。",
  "connect.chatgpt.note":
    "能否使用自定义 MCP 服务器取决于你的 ChatGPT 套餐和工作区设置。在某些个人套餐中，ChatGPT 只允许读取，因此可能无法记录或更改潜水。",

  "connect.gemini.hint": "gemini.google.com（美国的个人 Google 账户）",
  "connect.gemini.step1":
    "在电脑上打开 <strong>Settings &gt; Connected Apps</strong>，然后在 <strong>Custom apps</strong> 下点击 <strong>Add a custom app</strong>。",
  "connect.gemini.step2": "粘贴地址，点击 <strong>Next</strong> 并登录。{signIn}",
  "connect.gemini.step3": "在网页版添加后，它也可以在 Gemini 移动应用中使用。",

  "connect.leChat.step1": "打开侧边栏，选择 <strong>Intelligence &gt; Connectors &gt; Add Connector</strong>，然后切换到 <strong>Custom MCP Connector</strong> 标签页。",
  "connect.leChat.step2": "将其命名为 <code>{name}</code>（不含空格），粘贴地址并点击 <strong>Connect</strong>。{signIn}",
  "connect.leChat.note": "在团队套餐中，只有管理员可以添加连接器。",

  "connect.perplexity.hint": "网页版和 Mac 应用，适用于 Pro、Max 和 Enterprise",
  "connect.perplexity.step1":
    "打开 <strong>Plugins</strong>（或 <strong>Settings &gt; Connectors</strong>），选择 <strong>Add custom &gt; Add MCP connector &gt; Remote</strong>。",
  "connect.perplexity.step2":
    "名称填写“MCP for PADI”，然后粘贴地址。在 <strong>Advanced</strong> 下选择 <strong>OAuth</strong> 和 <strong>Streamable HTTP</strong>。保存，将其打开并登录。{signIn}",

  "connect.claudeCode.hint": "终端、VS Code 和 JetBrains",
  "connect.claudeCode.step1": "运行这两条命令（或在 Claude Code 中输入 <code>{command}</code>）。浏览器会随之打开。{signIn}",
  "connect.claudeCode.note": "已经在 claude.ai 上添加了 MCP for PADI？使用同一 Claude 账户登录的 Claude Code 会自动列出它。",

  "connect.codex.hint": "OpenAI 的编程智能体：终端、IDE 扩展、ChatGPT 桌面应用",
  "connect.codex.step1": "运行该命令。Codex 会打开浏览器。{signIn}",
  "connect.codex.step2":
    "在 IDE 扩展或桌面应用中，你也可以使用 <strong>Settings &gt; MCP servers &gt; Add server</strong>，选择 <strong>Streamable HTTP</strong>，粘贴地址并点击 <strong>Authenticate</strong>。它们共用同一套设置。",

  "connect.cursor.hint": "编辑器及其 agent 命令",
  "connect.cursor.step1": "点击<strong>{button}</strong>，然后在 Cursor 中确认 <strong>Install</strong>。",
  "connect.cursor.step2": "Cursor 第一次使用 MCP for PADI 时会要求你登录（在终端中：<code>{command}</code>）。{signIn}",

  "connect.vscode.hint": "Agent 模式下的 GitHub Copilot",
  "connect.vscode.step1": "点击<strong>{button}</strong>，然后在 VS Code 中确认 <strong>Install</strong>。",
  "connect.vscode.step2": "当 VS Code 提示时启动服务器。浏览器会随之打开。{signIn}",
  "connect.vscode.step3": "在 Copilot Chat 的 <strong>Agent</strong> 模式中使用。",
  "connect.vscode.note": "Copilot Business 和 Enterprise：需要由管理员允许使用 MCP 服务器。",

  "connect.visualStudio.hint": "Visual Studio 2026 或 2022 17.14，GitHub Copilot",
  "connect.visualStudio.step1": "点击<strong>{button}</strong>并确认。",
  "connect.visualStudio.step2": "在 <code>{file}</code> 文件中，点击服务器上方的 <strong>Authentication Required</strong>。{signIn}",

  "connect.copilotCli.hint": "copilot 命令",
  "connect.copilotCli.step1": "运行该命令。当 Copilot 要求你登录时（或运行 <code>{command}</code> 后），浏览器会随之打开。{signIn}",

  "connect.geminiCli.hint": "Google 的命令行智能体",
  "connect.geminiCli.step1": "运行该命令。Gemini CLI 第一次使用 MCP for PADI 时会打开浏览器。{signIn}",

  "connect.windsurf.hint": "Devin Local、Devin CLI 和旧版 Cascade",
  "connect.windsurf.step1": "运行这两条命令。Devin Desktop 会读取相同的设置。{signIn}",
  "connect.windsurf.step2":
    "旧版 Windsurf 编辑器：在 Cascade 中打开 MCP 菜单，选择 <strong>Open MCP config file</strong>，在 <code>{key}</code> 下添加 <code>{snippet}</code>，然后刷新。",
  "connect.windsurf.note": "在 Enterprise 套餐中，需要由管理员允许使用 MCP 服务器。",

  "connect.zed.hint": "Zed 编辑器的智能体",
  "connect.zed.step1":
    "打开 <strong>Settings &gt; AI &gt; MCP Servers &gt; Add Server &gt; Add Remote Server</strong> 并粘贴地址，或将代码片段添加到你的设置文件中。",
  "connect.zed.step2": "当 Zed 提示时，点击 <strong>Authenticate</strong>。{signIn}",

  "connect.jetbrains.name": "JetBrains IDE",
  "connect.jetbrains.hint": "IntelliJ IDEA、PyCharm、WebStorm 等 IDE 中的 Junie 和 AI Assistant",
  "connect.jetbrains.copyAiAssistant": "AI Assistant：如果没有打开登录页面",
  "connect.jetbrains.step1":
    "<strong>Junie</strong>：添加第一个代码片段（或在 Junie CLI 中运行 <code>{command}</code>，然后添加远程服务器），再选择 <strong>Authorize</strong>。{signIn}",
  "connect.jetbrains.step2":
    "<strong>AI Assistant</strong>：打开 <strong>Settings &gt; Tools &gt; AI Assistant &gt; Model Context Protocol (MCP) &gt; Add &gt; JSON configuration</strong>，粘贴一个代码片段，然后点击 <strong>OK</strong> 和 <strong>Apply</strong>。",

  "connect.kiro.hint": "IDE、CLI 和网页版",
  "connect.kiro.step1": "点击<strong>{button}</strong> 并在 Kiro 中确认。Kiro 会自动打开登录页面。{signIn}",

  "connect.cline.hint": "VS Code 和 JetBrains 扩展、Cline CLI",
  "connect.cline.step1":
    "运行该命令，或在 Cline 面板中打开 <strong>MCP Servers &gt; Remote Servers</strong>，输入名称和地址，然后选择 <strong>Streamable HTTP</strong>。",
  "connect.cline.step2": "当 Cline 提示时，批准登录。{signIn}",

  "connect.warp.hint": "终端内置的智能体",
  "connect.warp.copy": "粘贴到 Settings > Agents > MCP servers > + Add",
  "connect.warp.step1": "粘贴代码片段，点击 <strong>Start</strong>，然后在浏览器中完成登录。{signIn}",

  "connect.raycast.hint": "Mac、Windows 和 iPhone，Raycast Pro",
  "connect.raycast.step1":
    "运行 <strong>Install MCP Server</strong>。名称填写“MCP for PADI”，Transport 选择 <strong>HTTP</strong>，粘贴地址，OAuth 类型选择 <strong>Dynamic</strong>，然后点击 <strong>Install</strong>。",
  "connect.raycast.step2": "点击 <strong>Sign In</strong>。{signIn}",

  "connect.lmStudio.hint": "本地模型，0.4.10 或更高版本",
  "connect.lmStudio.copy": "或添加到 {file}（Program 标签页 > Install > Edit {file}）",
  "connect.lmStudio.step1": "点击<strong>{button}</strong>（需已安装 LM Studio）并确认。然后在浏览器中登录。{signIn}",
  "connect.lmStudio.note": "请使用支持工具调用的模型。",

  "connect.goose.hint": "goose Desktop 和 CLI",
  "connect.goose.step1": "点击<strong>{button}</strong>（需已安装 goose Desktop）并确认。Goose 会自动登录。{signIn}",
  "connect.goose.step2":
    "CLI：<code>{command}</code> &gt; <strong>Add Extension</strong> &gt; <strong>Remote Extension (Streamable HTTP)</strong>，然后粘贴地址。",

  "connect.jan.hint": "Jan Desktop 和 Jan CLI",
  "connect.jan.step1":
    "运行该命令，或在 Jan Desktop 中打开 <strong>Settings &gt; MCP Servers &gt; Add MCP Server</strong>，传输方式选择 <strong>HTTP</strong>，然后粘贴地址。",
  "connect.jan.step2": "使用该服务器的 <strong>Sign in</strong> 操作。{signIn}",

  "connect.msty.hint": "桌面应用",
  "connect.msty.step1":
    "打开 <strong>Toolbox &gt; Tools &gt; Add New Tool</strong>，名称填写“MCP for PADI”，选择 <strong>HTTP</strong>，粘贴地址并选择 <strong>OAuth</strong>。",
  "connect.msty.step2": "点击 <strong>Test tool</strong> 并登录，然后点击 <strong>Save</strong>。{signIn}",

  "connect.openWebui.hint": "自托管，0.6.31 或更高版本，由管理员添加",
  "connect.openWebui.step1":
    "管理员：打开 <strong>Settings &gt; Admin &gt; Integrations &gt; External Tool Servers &gt; Add Connection</strong>，类型选择 <strong>MCP (Streamable HTTP)</strong>，粘贴地址，认证方式选择 <strong>OAuth 2.1</strong>，点击 <strong>Register Client</strong> 并保存。",
  "connect.openWebui.step2": "每位用户：在聊天中选择 <strong>+ &gt; Integrations &gt; Tools</strong>，打开 MCP for PADI 并登录。{signIn}",

  "connect.librechat.hint": "自托管",
  "connect.librechat.copy": "{file}（管理员）",
  "connect.librechat.step1":
    "将其添加到 <code>{file}</code> 并重启，或在侧边栏中使用 <strong>MCP Settings &gt; Add MCP</strong>，传输方式选择 <strong>Streamable HTTPS</strong>。",
  "connect.librechat.step2": "点击 <strong>Connect</strong>，然后点击 <strong>Continue with OAuth</strong>。{signIn}",

  "connect.n8n.hint": "AI Agent 工作流",
  "connect.n8n.step1":
    "在 <strong>AI Agent</strong> 节点中添加 <strong>MCP Client Tool</strong>。Endpoint 填写该地址，传输方式选择 <strong>HTTP Streamable</strong>。",
  "connect.n8n.step2":
    "Authentication 选择 <strong>MCP OAuth2</strong>，创建凭证（保持“Use Dynamic Client Registration”开启）并连接。{signIn}",

  "connect.other.name": "其他 AI 应用",
  "connect.other.hint": "任何支持远程 MCP 服务器的应用",
  "connect.other.copyJson": "大多数应用（JSON）",
  "connect.other.copyLocal": "只能运行本地服务器的应用",
  "connect.other.step1":
    "找到 <strong>Add MCP server</strong>（有时称为“custom connector”或“tools”），并使用上方的地址。如果需要选择，请选择 <strong>HTTP</strong> 或 <strong>Streamable HTTP</strong>。",
  "connect.other.step2": "登录使用 OAuth：应用会打开此网站。{signIn}无需在应用中输入 API 密钥或密码。",
  "connect.other.step3":
    "如果应用只能启动本地程序，或无法登录远程服务器（例如 Roo Code 和 Continue），请使用第二个代码片段：其中的 <code>{command}</code>（需要 Node.js）会连接到此服务器并处理登录。",
} satisfies Record<keyof typeof en, string>;
