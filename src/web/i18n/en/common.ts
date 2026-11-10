/** English texts: common (layout, menus, messages shown after a redirect, error pages). Keys start with "common.". */
export default {
  // The product name: the same in every language (do not translate it). Page titles are shown as
  // "<title> · MCP for PADI".
  "common.appName": "MCP for PADI",

  // Top bar
  "common.nav.main": "Main",
  "common.nav.account": "PADI account",
  "common.nav.accountShort": "PADI",
  "common.nav.connections": "Connected apps",
  "common.nav.connectionsShort": "Apps",
  "common.nav.security": "Security",
  "common.nav.admin": "Admin",
  "common.nav.requestsWaiting": "Access requests waiting",
  "common.nav.signedInAs": "Signed in as {email}",
  "common.nav.signOut": "Sign out",
  "common.nav.signIn": "Sign in",

  // Footer
  "common.footer.author": "Author: <a href=\"https://marco.visin.ch\" target=\"_blank\" rel=\"noopener noreferrer\">Marco Visin</a>",
  "common.footer.about": "MCP for PADI connects your AI assistant (Claude, ChatGPT, Gemini, Cursor, VS Code and others) to your PADI dive logbook.",
  "common.footer.disclaimer": "MCP for PADI is an independent open-source project. It is not made by, affiliated with, or endorsed by PADI (Professional Association of Diving Instructors). PADI is a registered trademark of PADI Worldwide Corp.",
  "common.footer.language": "Language",
  // The links at the bottom of every page (the menu's label is read by screen readers)
  "common.footer.legal": "Legal and contact",
  "common.footer.privacy": "Privacy",
  "common.footer.terms": "Terms",
  "common.footer.contact": "Contact",

  // Dates
  "common.never": "never",

  // Messages shown after a redirect
  "common.flash.saved": "Saved.",
  "common.flash.removed": "Your PADI connection was removed.",
  "common.flash.revoked": "Access revoked.",
  "common.flash.password": "Password changed.",
  "common.flash.sessions": "Signed out of all other browsers.",
  "common.flash.settings": "Server settings saved.",
  "common.flash.user": "User updated.",
  "common.flash.approved": "Request approved. The person is not notified automatically: let them know they can sign in now.",
  "common.flash.rejected": "Request rejected and deleted.",
  "common.flash.deleted": "Deleted.",
  "common.flash.welcome": "Welcome! Sign in to PADI below, then connect your AI app.",
  "common.flash.denied": "Access was denied.",
  "common.flash.csrf": "Your form expired. Please try again.",
  "common.flash.lastadmin": "You cannot remove the last administrator.",

  // Errors
  "common.error.tooManyAttempts": "Too many attempts. Wait a few minutes and try again.",
  "common.error.forbidden": "You do not have access to this page.",
  "common.error.notFoundTitle": "Page not found",
  "common.error.notFoundText": "This address does not exist on this server.",
  "common.error.goHome": "Go to the start page",
  "common.error.title": "Error",
  "common.error.somethingWrong": "Something went wrong",
  "common.error.tryAgain": "Please try again in a moment.",

  // Buttons used on several pages
  "common.copy": "Copy",

  // Texts for the page script (keys "common.js.*" are sent to the browser)
  "common.js.copied": "Copied",
  "common.js.live": "Live",
  "common.js.paused": "Paused",
  "common.js.reconnecting": "Reconnecting",
  "common.js.signedOut": "Signed out, reload the page",
  "common.js.ok": "ok",
  "common.js.error": "error",
};
