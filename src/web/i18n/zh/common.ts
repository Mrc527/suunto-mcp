import type en from "../en/common.js";

/** Translations (zh): common. Every key of ../en/common.ts, the same placeholders and markup. */
export default {
  "common.appName": "MCP for PADI",

  "common.nav.main": "主导航",
  "common.nav.account": "PADI 账户",
  "common.nav.accountShort": "PADI",
  "common.nav.connections": "已连接的应用",
  "common.nav.connectionsShort": "应用",
  "common.nav.security": "安全性",
  "common.nav.admin": "管理",
  "common.nav.requestsWaiting": "有待处理的访问申请",
  "common.nav.signedInAs": "已登录为 {email}",
  "common.nav.signOut": "退出登录",
  "common.nav.signIn": "登录",

  "common.footer.author": "作者：<a href=\"https://marco.visin.ch\" target=\"_blank\" rel=\"noopener noreferrer\">Marco Visin</a>",
  "common.footer.about": "MCP for PADI 可将你的 AI 助手（Claude、ChatGPT、Gemini、Cursor、VS Code 等）连接到你的 PADI 潜水日志。",
  "common.footer.disclaimer":
    "MCP for PADI 是一个独立的开源项目。它并非由 PADI（国际专业潜水教练协会）开发，与 PADI 没有关联，也未获得 PADI 认可。PADI 是 PADI Worldwide Corp. 的注册商标。",
  "common.footer.language": "语言",
  "common.footer.legal": "法律信息与联系方式",
  "common.footer.privacy": "隐私",
  "common.footer.terms": "条款",
  "common.footer.contact": "联系我们",

  "common.never": "从未",

  "common.flash.saved": "已保存。",
  "common.flash.removed": "你的 PADI 连接已移除。",
  "common.flash.revoked": "已撤销访问权限。",
  "common.flash.password": "密码已更改。",
  "common.flash.sessions": "已从所有其他浏览器退出登录。",
  "common.flash.settings": "服务器设置已保存。",
  "common.flash.user": "用户已更新。",
  "common.flash.approved": "申请已批准。系统不会自动通知对方，请告诉对方现在可以登录了。",
  "common.flash.rejected": "申请已拒绝并删除。",
  "common.flash.deleted": "已删除。",
  "common.flash.welcome": "欢迎！请先在下方登录 PADI，然后连接你的 AI 应用。",
  "common.flash.denied": "已拒绝访问。",
  "common.flash.csrf": "表单已过期。请重试。",
  "common.flash.lastadmin": "你不能移除最后一位管理员。",

  "common.error.tooManyAttempts": "尝试次数过多。请等待几分钟后再试。",
  "common.error.forbidden": "你无权访问此页面。",
  "common.error.notFoundTitle": "找不到页面",
  "common.error.notFoundText": "此服务器上不存在这个地址。",
  "common.error.goHome": "前往首页",
  "common.error.title": "错误",
  "common.error.somethingWrong": "出了点问题",
  "common.error.tryAgain": "请稍后再试。",

  "common.copy": "复制",

  "common.js.copied": "已复制",
  "common.js.live": "实时",
  "common.js.paused": "已暂停",
  "common.js.reconnecting": "正在重新连接",
  "common.js.signedOut": "已退出登录，请重新载入页面",
  "common.js.ok": "成功",
  "common.js.error": "错误",
} satisfies Record<keyof typeof en, string>;
