import type en from "../en/auth.js";

/** Translations (zh): auth. Every key of ../en/auth.ts, the same placeholders and markup. */
export default {
  "auth.field.email": "电子邮件",
  "auth.field.password": "密码",

  "auth.signIn.title": "登录",
  "auth.signIn.intro": "请使用你在此服务器上创建的账户。这不是你的 PADI 账户。",
  "auth.signIn.button": "登录",
  "auth.signIn.noAccountRequest": "还没有账户？<a href=\"{url}\">申请访问</a>。",
  "auth.signIn.noAccountCreate": "还没有账户？<a href=\"{url}\">创建账户</a>。",
  "auth.signIn.wrongCredentials": "电子邮件或密码不正确。如果你已申请访问，申请可能仍在等待批准。",
  "auth.signIn.disabled": "此账户已停用。",

  "auth.signUp.closedTitle": "注册",
  "auth.signUp.closedHeading": "注册已关闭",
  "auth.signUp.closedText": "请向此服务器的管理员申请账户。",

  "auth.signUp.requestTitle": "申请访问",
  "auth.signUp.createTitle": "创建账户",
  "auth.signUp.introFirst": "你是第一位用户，因此此账户将成为管理员。",
  "auth.signUp.introApproval": "管理员会审核每个申请，获批后你即可登录。",
  "auth.signUp.introOpen": "在此服务器上创建账户。之后再登录 PADI。",
  "auth.signUp.emailHint": "用于登录此服务器。",
  "auth.signUp.emailHintDomains": "用于登录此服务器。允许的域：{domains}。",
  "auth.signUp.passwordHint.one": "至少 {n} 个字符。请勿在此使用你的 PADI 密码。",
  "auth.signUp.passwordHint.other": "至少 {n} 个字符。请勿在此使用你的 PADI 密码。",
  "auth.signUp.repeatPassword": "确认密码",
  "auth.signUp.inviteCode": "邀请码",
  "auth.signUp.inviteHint": "可选。使用有效的邀请码，你的账户即可立即使用。",
  "auth.signUp.note": "给管理员的留言",
  "auth.signUp.noteHint": "可选。说明你是谁以及为什么需要访问权限。",
  "auth.signUp.consent": "我了解此服务器将保留一个 PADI 登录令牌（加密存储，绝不是我的 PADI 密码），以便代表我执行操作。",
  "auth.signUp.consentTerms": "我同意<a href=\"/terms\" target=\"_blank\" rel=\"noopener\">使用条款</a>，并已阅读<a href=\"/privacy\" target=\"_blank\" rel=\"noopener\">隐私政策</a>。",
  "auth.signUp.sendRequest": "发送申请",
  "auth.signUp.createAccount": "创建账户",
  "auth.signUp.alreadyRegistered": "已有账户？<a href=\"/login\">登录</a>。",

  "auth.requestSent.title": "申请已发送",
  "auth.requestSent.thanks": "谢谢。管理员将审核你的申请。",
  "auth.requestSent.noEmail": "你不会收到电子邮件通知，请稍后回来查看，或询问管理员。",
  "auth.requestSent.signInLater": "申请获批后，请使用你的电子邮件地址和密码登录。如果你之前已为此地址发送过申请，则只有第一个申请有效，请使用你当时设置的密码。",
  "auth.requestSent.expiry": "30 天内未获处理的申请将被删除，届时你可以重新发送申请。",
  "auth.requestSent.goToSignIn": "前往登录",

  "auth.password.tooShort.one": "请至少使用 {n} 个字符。",
  "auth.password.tooShort.other": "请至少使用 {n} 个字符。",
  "auth.password.tooLong": "密码太长。",

  "auth.error.formExpired": "表单已过期。请重试。",
  "auth.error.invalidEmail": "请输入有效的电子邮件地址。",
  "auth.error.domainNotAllowed": "只有 {domains} 的地址才能注册。",
  "auth.error.passwordsDiffer": "两次输入的密码不一致。",
  "auth.error.consent": "请勾选复选框以确认。",
  "auth.error.inviteInvalid": "此邀请码无效或已被使用。",
  "auth.error.tooManyOpenRequests": "当前待处理的申请过多。请稍后再试。",
  "auth.error.accountExists": "使用此电子邮件地址的账户已存在。",

  "auth.error.tooManyAttempts": "尝试次数过多。请几分钟后再试。",
  "auth.error.tooManyRequestsToday": "你今天已发送了多个申请。请等待管理员回复。",
} satisfies Record<keyof typeof en, string>;
