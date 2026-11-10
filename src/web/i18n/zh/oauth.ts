import type en from "../en/oauth.js";

/** Translations (zh): oauth. Every key of ../en/oauth.ts, the same placeholders and markup. */
export default {
  "oauth.consent.title": "允许访问",
  "oauth.consent.heading": "允许访问你的 PADI 潜水日志？",
  "oauth.consent.intro": "一个自称 <strong>{name}</strong> 的应用想通过此服务器使用你的 PADI 潜水日志。你当前以 <strong>{email}</strong> 身份登录。",
  "oauth.consent.unknownApp": "未知应用",
  "oauth.consent.known": "已识别的应用：你的选择将发送给 <strong>{app}</strong>（<code>{host}</code>）。",
  "oauth.consent.device": "你的选择会留在此设备上（<code>{host}</code>），Claude Code、Codex 或 Cursor 等桌面应用和命令行应用会在这里接收它。请仅在你刚刚开始在这里连接应用时允许访问，并且切勿将随后跳转到的网址复制到任何网站、聊天或电子邮件中。",
  "oauth.consent.unknown.title": "我们无法识别此应用",
  "oauth.consent.unknown.claims": "它使用了 {app} 的名称，但 {app} 从不会将你转到 <code>{host}</code>。",
  "oauth.consent.unknown.text": "如果你允许，<code>{host}</code> 将可以访问你的 PADI 潜水日志。请仅在你自己开始连接此应用并且信任该地址时允许访问。如果此链接是别人发给你的，请选择“不允许”。",
  "oauth.consent.unknown.confirm": "是我自己开始连接此应用的，并且我信任 <code>{host}</code>。",
  "oauth.consent.unknown.confirmMissing": "要允许此应用访问，请先勾选复选框，确认你信任它。",
  "oauth.consent.logbook": "潜水日志",
  "oauth.consent.logbookRead": "查看你的潜水记录和统计数据，但不更改任何内容",
  "oauth.consent.logbookWrite": "查看你的潜水记录和统计数据，记录新的潜水，更改和删除潜水，并将潜水提交给 PADI 专业会员验证",
  "oauth.consent.cards": "潜水证书",
  "oauth.consent.cardsRead": "查看你的 PADI 电子证书卡",
  "oauth.consent.noPadi": "你尚未连接 PADI 账户。<a href=\"{url}\">立即连接</a>，完成后会返回此页面；你也可以现在允许访问，稍后再连接。",
  "oauth.consent.demo": "这是一个演示账户：该应用将看到内置于此服务器的示例潜水日志。不会向 PADI 发送任何内容。",
  "oauth.consent.allow": "允许",
  "oauth.consent.deny": "不允许",
  "oauth.consent.disconnectHint": "你可以随时在“已连接的应用”中断开连接。",

  "oauth.expired.title": "请求已过期",
  "oauth.expired.heading": "此请求已过期",
  "oauth.expired.text": "请返回你的 AI 应用并重新连接。",
  "oauth.formExpired.title": "表单已过期",
  "oauth.formExpired.heading": "此表单已过期",
  "oauth.formExpired.text": "请返回你的 AI 应用并重新连接。",

  "oauth.returning.title": "正在返回应用",
  "oauth.returning.heading": "正在返回应用",
  "oauth.returning.text": "如果没有任何反应，请点击“继续”。",
  "oauth.returning.continue": "继续",
} satisfies Record<keyof typeof en, string>;
