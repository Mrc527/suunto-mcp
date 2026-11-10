/** English texts: oauth (the page where people allow an AI app to use their Suunto data, and the pages around it). Keys start with "oauth.". */
export default {
  // Consent page
  "oauth.consent.title": "Allow access",
  "oauth.consent.heading": "Allow access to your Suunto data?",
  // {name} is the name the app gave itself, {email} the account signed in on this server.
  "oauth.consent.intro": "An app that calls itself <strong>{name}</strong> wants to use your Suunto data through this server. You are signed in as <strong>{email}</strong>.",
  // Used for {name} when the app did not give itself a name and has no return address.
  "oauth.consent.unknownApp": "An application",
  // Where the answer goes. {host} is a web address such as claude.ai or localhost:33418.
  "oauth.consent.known": "Recognized app: your answer goes to <strong>{app}</strong> at <code>{host}</code>.",
  "oauth.consent.device": "Your answer stays on this device (<code>{host}</code>), where desktop and command-line apps such as Claude Code, Codex or Cursor wait for it. Only allow it if you just started connecting an app here, and never copy the address you land on into a website, chat or e-mail.",
  "oauth.consent.unknown.title": "We don't recognize this app",
  // {app} is a well-known app (Claude, ChatGPT, ...) whose name this app uses.
  "oauth.consent.unknown.claims": "It uses the name of {app}, but {app} never sends you to <code>{host}</code>.",
  "oauth.consent.unknown.text": "If you allow it, <code>{host}</code> gets access to your Suunto data. Only allow it if you started connecting this app yourself and you trust that address. If someone sent you this link, choose Don't Allow.",
  "oauth.consent.unknown.confirm": "I started connecting this app myself, and I trust <code>{host}</code>.",
  "oauth.consent.unknown.confirmMissing": "To allow this app, first tick the box to confirm that you trust it.",
  // What the app may do (read-only accounts get the "Read" line for routes).
  "oauth.consent.workouts": "Workouts",
  "oauth.consent.workoutsRead": "See your workouts with laps, heart rate zones and statistics, and export them as FIT files",
  "oauth.consent.health": "Daily activity and health",
  "oauth.consent.healthRead": "See your daily steps and energy, 24/7 heart rate, sleep and recovery",
  "oauth.consent.routes": "Routes and points of interest",
  "oauth.consent.routesRead": "See your routes and points of interest, without changing anything",
  "oauth.consent.routesWrite": "See your routes and points of interest, and add new ones to your Suunto App",
  "oauth.consent.noSuunto": "You have not connected your Suunto account yet. <a href=\"{url}\">Connect it now</a> and you will come back here, or allow access now and connect it later.",
  "oauth.consent.demo": "This is a demo account: the app sees invented sample data built into this server. Nothing is sent to Suunto.",
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
