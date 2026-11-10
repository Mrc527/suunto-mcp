import type en from "../en/legal.js";

/** Translations (zh): legal. Every key of ../en/legal.ts, the same placeholders and markup. */
export default {
  "legal.updated": "最后更新：{date}",
  "legal.onThisPage": "本页内容",
  "legal.englishPrevails": "本页面还提供其他语言版本。如果译文与英文版本不一致，以英文版本为准。",
  "legal.seeTerms": "另请参阅<a href=\"/terms\">使用条款</a>。",
  "legal.seePrivacy": "另请参阅<a href=\"/privacy\">隐私政策</a>。",
  "legal.duration.minutes.one": "{n} 分钟",
  "legal.duration.minutes.other": "{n} 分钟",
  "legal.duration.hours.one": "{n} 小时",
  "legal.duration.hours.other": "{n} 小时",
  "legal.duration.days.one": "{n} 天",
  "legal.duration.days.other": "{n} 天",

  "legal.privacy.title": "隐私政策",
  "legal.privacy.intro": "本政策说明 {app} 会存储你的哪些信息、为什么存储、存储多久，以及还有谁会收到你的数据。简而言之：我们只保留服务所需的数据，你的 Suunto 密码永远不会到达此服务器，你的 Suunto 令牌会加密存储，你的运动记录和健康数据不会被存储。",

  "legal.privacy.controller.title": "谁对你的数据负责",
  "legal.privacy.controller.text": "{site} 上的 {app} 由瑞士卢加诺（Lugano）的 {operator} 运营。{operator} 对你的个人数据负责，是瑞士《联邦数据保护法》（FADP）以及（在适用时）欧盟《通用数据保护条例》（GDPR）所指的数据控制者。",
  "legal.privacy.controller.contact": "如对你的数据有任何疑问，或希望行使你的权利，请发送电子邮件至 {email}。",

  "legal.privacy.data.title": "我们存储哪些数据及原因",
  "legal.privacy.data.lead": "我们只存储服务运行所需的数据：",
  "legal.privacy.data.account": "<strong>你的账户。</strong>你的电子邮件地址以及你为 {app} 设置的密码。密码仅以 scrypt 哈希值的形式存储，因此我们无法看到它。我们还会存储你创建账户和上次登录的时间，以及账户是否已停用、是否为管理员账户。我们需要这些信息来为你提供账户并保障其安全。",
  "legal.privacy.data.request": "<strong>你的访问申请。</strong>如果你申请访问，我们会存储你写给管理员的留言，以便管理员做出决定。你的申请获批后，该留言即被删除。如果本服务设置了邮件服务器，并且管理员没有关闭电子邮件通知，你的电子邮件地址和这条留言还会通过电子邮件发送给管理员（参见“谁会收到你的数据”）。",
  "legal.privacy.data.invite": "<strong>邀请码。</strong>如果你使用邀请码注册，该邀请会记录你的电子邮件地址以及你使用它的时间。",
  "legal.privacy.data.suunto": "<strong>你的 Suunto 连接。</strong>你的 Suunto 用户名、你在这里连接账户时 Suunto 提供的访问令牌和刷新令牌、访问令牌的过期时间、连接是否需要续期，以及你的设置：单位、只读模式和时区，还有你的连接时间和当时测试请求的结果（你最近 30 天有多少条运动记录，或者请求失败的原因）。这些信息使用 AES-256-GCM 加密存储。你在 Suunto 自己的页面上登录，因此你的 Suunto 密码永远不会到达此服务器。在连接过程中，我们会保存一个一次性代码的哈希值，该代码在 10 分钟后过期，用于确认 Suunto 的回复属于你。我们需要这些信息来代表你访问你的 Suunto 数据。",
  "legal.privacy.data.apps": "<strong>已连接的 AI 应用。</strong>当你连接一个 AI 应用时，我们会存储该应用的注册信息（它为自己提供的名称和网址），以及允许它代表你的账户执行操作的令牌。令牌仅以哈希值的形式存储。我们还会存储每个连接的建立时间和上次使用时间，以便你查看并撤销它。",
  "legal.privacy.data.activity": "<strong>活动日志。</strong>对于 AI 应用执行的每项操作（一次工具调用，例如 <code>suunto_list_workouts</code>），我们会记录时间、应用、工具、耗时以及是否成功。我们不会记录读取或写入的内容：不记录运动记录、心率、睡眠、位置、路线或兴趣点。你可以在“已连接的应用”页面查看最新的记录，我们则使用该日志来查找错误和滥用行为。",
  "legal.privacy.data.sessions": "<strong>浏览器会话。</strong>当你登录时，你的浏览器会在 Cookie 中获得一个随机会话代码。我们只存储它的哈希值，以及它的创建时间和过期时间。",
  "legal.privacy.data.ip": "<strong>IP 地址。</strong>与所有网站一样，服务器可以看到每个请求的 IP 地址。{app} 仅将其保存在内存中，最多保存一天，用于限制重复尝试，例如过多的登录尝试。它不会将 IP 地址保存到数据库或日志中。",
  "legal.privacy.data.log": "<strong>服务器日志。</strong>服务器会为登录失败、新建账户或出错等事件写入简短的技术日志。日志不包含密码、令牌、IP 地址，也不包含你的 Suunto 数据的内容。但当某项操作失败时，错误信息可能包含一些简短的详细信息，例如被 Suunto 拒绝的某个值。",

  "legal.privacy.content.title": "你的运动记录和健康数据不会被存储",
  "legal.privacy.content.text": "当 AI 应用请求你的运动记录、日常活动、心率、睡眠、恢复、路线或兴趣点时，{app} 会从 Suunto 获取它们并传递给该应用。它们不会保存到数据库或磁盘上，FIT 文件以及你的运动记录和路线中的位置也是如此。为了节省对 Suunto 的调用，最近的回复会在服务器内存中保留 2 到 30 分钟（每个用户最多 20 MB），服务器重启后即消失。服务器日志只包含上文所述的简短错误信息。你的账户页面显示的是你连接时所做测试请求的结果，从不为了显示页面而向 Suunto 发出请求。",
  "legal.privacy.content.sent": "你的 AI 应用添加的路线和兴趣点会保存在你的 Suunto 账户中，就像你在 Suunto App 中添加的一样，并且可以同步到你的手表。{app} 之后不会更改或删除它们：你可以在 Suunto App 中删除它们。",

  "legal.privacy.bases.title": "法律依据",
  "legal.privacy.bases.lead": "我们依照瑞士 FADP 处理你的数据。在适用 GDPR 的情况下，我们依据以下法律依据：",
  "legal.privacy.bases.contract": "<strong>合同</strong>（GDPR 第 6 条第 1 款 b 项）：提供你注册的服务，即你的账户、你的 Suunto 连接、你已连接的应用以及你的活动日志。",
  "legal.privacy.bases.health": "<strong>你的明确同意</strong>（GDPR 第 9 条第 2 款 a 项），适用于心率、睡眠和恢复等健康数据：当你连接 Suunto 账户并向 AI 应用询问这些数据时，即表示你给予了同意。你可以随时通过移除 Suunto 连接来撤回同意。",
  "legal.privacy.bases.interest": "<strong>正当利益</strong>（GDPR 第 6 条第 1 款 f 项）：保障服务的安全和正常运行，包括限制重复尝试、服务器日志、备份以及防范滥用。",
  "legal.privacy.bases.law": "<strong>法律义务</strong>（GDPR 第 6 条第 1 款 c 项）：当法律要求我们保留或提供数据时。",

  "legal.privacy.retention.title": "我们保留数据的时间",
  "legal.privacy.retention.account": "<strong>账户：</strong>直到你或管理员将其删除。",
  "legal.privacy.retention.suunto": "<strong>Suunto 连接：</strong>直到你在 Suunto 账户页面将其移除，或删除你的账户。之后令牌会从此服务器上删除，并且 {app} 会请求 Suunto 结束该连接。连接时使用的一次性代码会在使用后删除，过期的代码会定期删除。",
  "legal.privacy.retention.request": "<strong>访问申请：</strong>如被拒绝则立即删除；如无人处理，则在 30 天后删除。写给管理员的留言会在申请获批时删除。有关某个申请的通知电子邮件会保留在管理员的邮箱中，直到管理员将其删除。",
  "legal.privacy.retention.sessions": "<strong>浏览器会话：</strong>直到你退出登录，最长 {lifetime}。",
  "legal.privacy.retention.tokens": "<strong>应用连接：</strong>访问令牌的有效期为 {access}。连接会在你撤销它时结束，或在连续 {refresh}未使用后结束。每个令牌会在过期一天后被删除。",
  "legal.privacy.retention.clients": "<strong>应用注册信息</strong>（不与你的账户关联）：如果没有人批准该应用，则在一天后删除；否则，在不再有任何连接使用它时删除，但最早在其首次获批 90 天后删除。",
  "legal.privacy.retention.activity": "<strong>活动日志：</strong>90 天。",
  "legal.privacy.retention.invites": "<strong>邀请：</strong>直到管理员删除该邀请。删除账户不会将你的电子邮件地址从你使用过的邀请中移除，因此请联系我们，我们会将其删除。",
  "legal.privacy.retention.log": "<strong>服务器日志：</strong>保存在大小有限的文件中（总计 50 MB）。最旧的记录会被覆盖。",
  "legal.privacy.retention.backups": "<strong>备份：</strong>每次软件更新或回滚之前，或者手动操作时，系统会创建一份数据库副本，并且只保留最新的 10 份副本。这些副本保存在同一台服务器上。你删除的数据可能会保留在这些副本中，直到它们被替换。你的 Suunto 连接在副本中仍保持加密。",

  "legal.privacy.recipients.title": "谁会收到你的数据",
  "legal.privacy.recipients.lead": "我们不会出售你的数据，不会与广告商共享，也不会用它来训练 AI 模型。你的数据只会提供给：",
  "legal.privacy.recipients.suunto": "<strong>Suunto。</strong>为了访问你的数据，{app} 会将你或你的 AI 应用发出的请求，连同你的访问令牌和本服务的密钥一起发送给 Suunto：读取运动记录、FIT 文件、日常活动、心率、睡眠、恢复、路线和兴趣点，以及添加路线和兴趣点。Suunto Oy 是你的 Suunto 账户中数据的独立控制者，并依据其自己的隐私政策处理这些数据。",
  "legal.privacy.recipients.apps": "<strong>你连接的 AI 应用。</strong>你批准的每个应用（例如 Anthropic 的 Claude 或 OpenAI 的 ChatGPT）都会收到它所请求的运动、健康、路线和兴趣点数据，以及其操作的结果。该应用如何处理这些数据，受其自己的条款和隐私政策以及你在该应用中的设置约束。我们对此无法控制。",
  "legal.privacy.recipients.hosting": "<strong>我们的托管服务提供商。</strong>{app} 运行在向云托管服务提供商租用的服务器上。该提供商为我们存储数据，不得将其用于自身目的。",
  "legal.privacy.recipients.admin": "<strong>管理员。</strong>{app} 的管理员可以看到账户列表，其中包括电子邮件地址、状态、是否已连接 Suunto、上次登录时间、过去 7 天的工具调用次数，以及访问申请中的留言。管理页面永远不会显示你的 Suunto 令牌或你的 Suunto 数据。如果本服务设置了邮件服务器，并且管理员没有关闭有关访问申请的电子邮件通知（通知默认是打开的），管理员还会通过电子邮件收到每个新申请的电子邮件地址和留言。这些电子邮件通过本服务的邮件服务器发送。",
  "legal.privacy.recipients.authorities": "<strong>主管机关</strong>，仅在法律要求时。",
  "legal.privacy.recipients.noTracking": "我们不使用任何分析、广告或跟踪服务，这些页面也不会从其他网站载入任何内容。",

  "legal.privacy.transfers.title": "在其他国家或地区处理的数据",
  "legal.privacy.transfers.text": "{app} 存储的数据保存在其服务器和备份中，位于托管服务提供商处。Suunto 和你连接的 AI 应用可能会在其他国家或地区处理你的数据，包括美国。这是因为你选择了使用它们的服务。如果你申请访问，你的电子邮件地址和留言可能会通过电子邮件发送给管理员，因此邮件服务器的提供商也可能会处理这些信息。它们的隐私政策说明了它们在何处处理数据以及如何保护数据。",

  "legal.privacy.security.title": "我们如何保护你的数据",
  "legal.privacy.security.encryption": "你的 Suunto 连接及其令牌使用 AES-256-GCM 加密。{app} 的密码使用 scrypt 进行哈希处理，会话代码、令牌和邀请码仅以哈希值的形式存储。",
  "legal.privacy.security.transport": "与 {app} 的连接使用 HTTPS，与 Suunto 的连接也使用 HTTPS。",
  "legal.privacy.security.web": "表单受到保护，可防范伪造请求；页面在严格的内容安全策略下运行；重复尝试会受到限制。",
  "legal.privacy.security.server": "本服务在一个受严格限制、没有额外权限的容器中运行，除数据文件夹外，其文件系统均为只读。",
  "legal.privacy.security.token": "由于 {app} 需要代表你与 Suunto 通信，服务器持有加密密钥，可以解密你的 Suunto 令牌。正因如此，它从不要求你提供 Suunto 密码，只需要令牌，而你可以随时在 <a href=\"/account\">Suunto 账户</a>页面将其移除。",
  "legal.privacy.security.report": "没有任何系统是绝对安全的。如果你发现安全问题，请报告至 {email}。我们会尽快回复，并修复已确认的问题。",

  "legal.privacy.rights.title": "你的权利",
  "legal.privacy.rights.lead": "你有权了解我们持有你的哪些数据、获取副本、要求更正或删除数据、限制或反对对数据的使用，以及将数据转移到其他地方。其中很多操作你可以自己完成：",
  "legal.privacy.rights.suunto": "在 <a href=\"/account\">Suunto 账户</a>页面更改或移除你的 Suunto 连接。对于你的 Suunto 账户本身中的数据，请使用 Suunto App 或联系 Suunto。",
  "legal.privacy.rights.apps": "在<a href=\"/account/connections\">已连接的应用</a>页面查看你已连接的应用和活动日志，并撤销任何应用的访问权限。",
  "legal.privacy.rights.delete": "在<a href=\"/account/security\">安全性</a>页面删除你的账户。这会立即删除你的账户、Suunto 连接、会话、应用连接和活动日志。备份中的副本会随着备份被替换而消失。你在 Suunto 的数据不会受到影响。",
  "legal.privacy.rights.email": "如有其他任何需求，请发送电子邮件至 {email}。我们会在 30 天内答复。",
  "legal.privacy.rights.complaint": "你也可以向数据保护机构投诉：在瑞士为联邦数据保护和信息专员（FDPIC），在欧盟为你居住或工作所在国家的数据保护机构。",

  "legal.privacy.cookies.title": "Cookie",
  "legal.privacy.cookies.lead": "{app} 只使用运行所必需的 Cookie，没有任何跟踪或广告 Cookie。这些 Cookie 只会发送到本网站，页面上的脚本无法读取它们，也不会与任何人共享。",
  "legal.privacy.cookies.session": "{name} 让你保持登录状态。它会在你退出登录时被删除，最长保留 {lifetime}。",
  "legal.privacy.cookies.pre": "{name} 保护登录和注册表单，防范伪造请求。它的有效期为 {lifetime}。",
  "legal.privacy.cookies.lang": "{name} 会记住你在语言菜单中选择的语言。它的有效期为 {lifetime}。",

  "legal.privacy.children.title": "儿童",
  "legal.privacy.children.text": "{app} 不面向儿童。你必须年满 16 周岁才能使用。如果你认为有儿童创建了账户，请联系我们，我们会将其删除。",

  "legal.privacy.changes.title": "本政策的变更",
  "legal.privacy.changes.text": "当服务或法律发生变化时，我们会更新本政策。页面顶部的日期显示最近一次更改的时间。如果某项更改影响你的数据的使用方式，我们会在本网站上指出。",

  "legal.terms.title": "使用条款",
  "legal.terms.intro": "本条款适用于 {site} 上的 {app}。请在创建账户之前阅读本条款。使用本服务即表示你同意本条款。",

  "legal.terms.service.title": "本服务",
  "legal.terms.service.text": "{app} 通过官方的 Suunto Cloud API 将 AI 应用连接到你的 Suunto 账户。这是一个免费、独立的开源项目，由瑞士卢加诺（Lugano）的 {operator} 运营。本服务没有付费套餐，也没有广告。",

  "legal.terms.affiliation.title": "与 Suunto 或 AI 提供商无关联",
  "legal.terms.affiliation.text": "{app} 是一个独立的开源项目。它使用官方的 Suunto Cloud API，但并非由 Suunto、Anthropic、OpenAI、Google 或任何其他 AI 提供商开发，与它们没有关联，也未获得它们的认可。Suunto 是 Suunto Oy 的注册商标。{app} 不使用任何 Suunto 图案或标志。其他产品名称归其各自所有者所有。",

  "legal.terms.account.title": "你的账户",
  "legal.terms.account.age": "你必须年满 16 周岁。",
  "legal.terms.account.secret": "请使用属于你自己的电子邮件地址，并对你的 {app} 密码保密。请勿与他人共用你的账户。你需要对使用你的账户进行的一切操作负责。",
  "legal.terms.account.approval": "新账户可能需要管理员批准或邀请码。任何人都无权要求获得账户。",

  "legal.terms.suunto.title": "你的 Suunto 账户",
  "legal.terms.suunto.text": "你在 Suunto 的登录页面上连接你自己的 Suunto 账户。请只连接属于你自己的 Suunto 账户。<a href=\"{url}\">Suunto</a> 的条款仍然适用于你。{app} 依赖 Suunto Cloud API：当 Suunto 更改或限制该接口，或终止本服务的访问权限时，{app} 可能会停止工作或以不同的方式工作。",

  "legal.terms.health.title": "不构成医疗建议",
  "legal.terms.health.text": "心率、睡眠、恢复、训练和其他数值来自你的手表和 Suunto App。{app} 和你的 AI 应用只是传递和解释这些数值，而 AI 应用可能会出错。它们不构成医疗建议，也不能代替医生。请勿仅凭这些数值做出有关健康的决定。",

  "legal.terms.safety.title": "不适用于导航或安全决策",
  "legal.terms.safety.text": "路线、兴趣点和位置可能有误、过时或不安全，尤其是由 AI 应用生成的。请勿依赖 {app} 或你的 AI 应用进行导航或做出安全决策。在沿某条路线出发之前，请先在地图上检查，并根据现场的实际情况行事。",

  "legal.terms.ai.title": "你的 AI 应用执行的操作",
  "legal.terms.ai.access": "你连接的 AI 应用代表你执行操作。它们可以读取你的运动记录、日常活动、心率、睡眠、恢复、路线和兴趣点；除非你打开只读模式，它们还可以向你的 Suunto App 添加路线和兴趣点。AI 应用会出错，例如在距离、日期、单位或地点上出错。",
  "legal.terms.ai.responsible": "由你决定连接哪些应用以及让它们做什么，你需要对结果负责。你的 AI 应用添加到 Suunto App 的路线和兴趣点由你负责：在同步到手表或使用之前，请先在 Suunto App 中检查，并删除你不需要的内容。如果你只想让应用读取，请在 <a href=\"/account\">Suunto 账户</a>页面打开只读模式。你可以随时在<a href=\"/account/connections\">已连接的应用</a>页面撤销应用的访问权限。",

  "legal.terms.use.title": "使用规范",
  "legal.terms.use.lead": "使用 {app} 时，请勿：",
  "legal.terms.use.content": "添加违反法律或侵犯他人权利的路线或兴趣点",
  "legal.terms.use.law": "违反法律、Suunto 的条款或侵犯他人权利",
  "legal.terms.use.others": "访问你无权使用的账户或数据",
  "legal.terms.use.harm": "使服务或 Suunto Cloud API 超载或对其发起攻击，或绕过它们的限制或安全措施",
  "legal.terms.use.report": "如果你发现安全问题，请报告至 {email}，而不要利用它。",

  "legal.terms.availability.title": "免费提供，不作任何保证",
  "legal.terms.availability.text": "本服务免费，并按“现状”提供。我们会尽力保持其运行和安全，但无法保证它始终可用、没有错误或适合你的用途。我们可能随时更改、限制或停止本服务或其部分功能。如果我们停止本服务，会尽量提前在本网站上公告。",

  "legal.terms.admin.title": "管理员可以做什么",
  "legal.terms.admin.text": "管理员可以批准或拒绝访问申请，停用、启用和删除账户，重置密码，结束应用连接，以及更改服务器设置，例如为所有人打开只读模式。例如，当本条款被违反、某个账户似乎落入他人之手，或者为了保护本服务及其用户时，管理员会采取这些措施。",

  "legal.terms.end.title": "终止使用",
  "legal.terms.end.text": "你可以随时停止使用：在<a href=\"/account/security\">安全性</a>页面删除你的账户，你的数据将按照<a href=\"/privacy\">隐私政策</a>中所述的方式删除。如果你违反本条款，或者本服务终止，我们可能会暂停或删除你的账户。",

  "legal.terms.liability.title": "责任",
  "legal.terms.liability.text": "在法律允许的范围内，对于因使用或无法使用 {app} 而造成的任何损害，{operator} 概不负责。这包括错误或缺失的数值，错误或不安全的路线或兴趣点，有关你的健康、训练或安全的决定，以及数据丢失。这不限制对故意或重大过失的责任，也不限制法律不允许排除的任何其他责任。",

  "legal.terms.privacy.title": "隐私",
  "legal.terms.privacy.text": "<a href=\"/privacy\">隐私政策</a>说明了 {app} 存储哪些数据、为什么存储以及存储多久。",

  "legal.terms.changes.title": "本条款的变更",
  "legal.terms.changes.text": "我们可能会更改本条款，例如在服务发生变化时。页面顶部的日期显示最近一次更改的时间。如果你在更改后继续使用 {app}，则适用新的条款。如果你不同意新条款，可以删除你的账户。",

  "legal.terms.law.title": "适用法律",
  "legal.terms.law.text": "本条款受瑞士法律管辖。除非强制性法律另有规定，瑞士法院拥有管辖权。如果你是消费者，你仍受你居住国强制性法律的保护。",

  "legal.terms.contact.title": "联系方式",
  "legal.terms.contact.text": "对本条款有疑问？请发送电子邮件至 {email}，联系 {operator}。",
} satisfies Record<keyof typeof en, string>;
