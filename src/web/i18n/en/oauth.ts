/** English texts: oauth (the page where people allow an AI app to use their PADI logbook, and the pages around it). Keys start with "oauth.". */
export default {
  // Consent page
  "oauth.consent.title": "Allow access",
  "oauth.consent.heading": "Allow access to your PADI logbook?",
  // {name} is the name the app gave itself, {email} the account signed in on this server.
  "oauth.consent.intro": "An app that calls itself <strong>{name}</strong> wants to use your PADI logbook through this server. You are signed in as <strong>{email}</strong>.",
  // Used for {name} when the app did not give itself a name and has no return address.
  "oauth.consent.unknownApp": "An application",
  // {host} is the address of the app, e.g. claude.ai
  // Where the answer goes. {host} is a web address such as claude.ai or localhost:33418.
  "oauth.consent.known": "Recognized app: your answer goes to <strong>{app}</strong> at <code>{host}</code>.",
  "oauth.consent.device": "Your answer stays on this device (<code>{host}</code>), where desktop and command-line apps such as Claude Code, Codex or Cursor wait for it. Only allow it if you just started connecting an app here, and never copy the address you land on into a website, chat or e-mail.",
  "oauth.consent.unknown.title": "We don't recognize this app",
  // {app} is a well-known app (Claude, ChatGPT, ...) whose name this app uses.
  "oauth.consent.unknown.claims": "It uses the name of {app}, but {app} never sends you to <code>{host}</code>.",
  "oauth.consent.unknown.text": "If you allow it, <code>{host}</code> gets access to your PADI logbook. Only allow it if you started connecting this app yourself and you trust that address. If someone sent you this link, choose Don't Allow.",
  "oauth.consent.unknown.confirm": "I started connecting this app myself, and I trust <code>{host}</code>.",
  "oauth.consent.unknown.confirmMissing": "To allow this app, first tick the box to confirm that you trust it.",
  // What the app may do (read-only accounts get the "Read" line).
  "oauth.consent.logbook": "Dive logbook",
  "oauth.consent.logbookRead": "See your dives and statistics, without changing anything",
  "oauth.consent.logbookWrite": "See your dives and statistics, log new dives, change and delete dives, and send a dive to a PADI Pro for verification",
  "oauth.consent.cards": "Certifications",
  "oauth.consent.cardsRead": "See your PADI certification cards",
  "oauth.consent.noPadi": "You have not connected your PADI account yet. <a href=\"{url}\">Connect it now</a> and you will come back here, or allow access now and connect it later.",
  "oauth.consent.demo": "This is a demo account: the app sees a sample logbook built into this server. Nothing is sent to PADI.",
  "oauth.consent.allow": "Allow",
  "oauth.consent.deny": "Don't Allow",
  "oauth.consent.disconnectHint": "You can disconnect it at any time under Connected apps.",

  // Request or form no longer valid
  "oauth.expired.title": "Request expired",
  "oauth.expired.heading": "This request has expired",
  "oauth.expired.text": "Go back to your AI app and connect again.",
  "oauth.formExpired.title": "Form expired",
  "oauth.formExpired.heading": "This form expired",
  "oauth.formExpired.text": "Go back to your AI app and connect again.",

  // Page shown while the browser goes back to the app
  "oauth.returning.title": "Returning to the app",
  "oauth.returning.heading": "Returning to the app",
  "oauth.returning.text": "If nothing happens, continue here.",
  "oauth.returning.continue": "Continue",
};
