/** English texts: home (the start page for people who are not signed in). Keys start with "home.". */
export default {
  // Page
  "home.title": "Your PADI logbook in your AI assistant",
  "home.description": "Connect Claude, ChatGPT and other AI apps to your PADI dive logbook. Ask about your dives, log new ones, and stay in control of what the apps can do.",

  // Buttons (hero and the end of the page)
  "home.signIn": "Sign in",
  "home.requestAccess": "Request access",
  "home.createAccount": "Create an account",

  // Hero
  "home.hero.title": "Your PADI logbook, inside your AI assistant.",
  "home.hero.lead": "Ask about your dives, log new ones and see your statistics in the AI apps you already use. Connect once, then just ask.",
  "home.hero.worksWith": "Works with Claude, ChatGPT, Gemini, Codex, Cursor, VS Code and other AI apps",

  // Video (only shown when a video exists; there is none yet)
  "home.video.title": "See it in action",
  "home.video.text": "A short video about what MCP for PADI can do and how to set it up.",
  "home.video.inEnglish": "This video is in English.",
  "home.video.unsupported": "Your browser cannot play this video. <a href=\"{url}\">Download it</a> instead.",

  // What you can do
  "home.features.title": "What you can do",
  "home.features.lead": "Ask in your own words, and your AI app does the work in your PADI logbook.",
  "home.logbook.name": "Dive logbook",
  "home.logbook.text": "Find and read your dives, log new dives with depth, time, conditions and gear, and fix the ones you logged. Export your logbook as CSV or JSON.",
  "home.cards.name": "Certifications",
  "home.cards.text": "See your PADI certification cards (eCards) with their dates and numbers, and look up a PADI Pro by member number.",
  "home.stats.title": "Statistics in seconds",
  "home.stats.text": "Total dives and bottom time, your deepest and longest dives, and dives per year, month, site or dive type, in metric or imperial units.",
  "home.anyApp.title": "Works with any AI app",
  "home.anyApp.text": "Built on the Model Context Protocol (MCP), the open standard that AI apps use to connect to tools and data. Any app that supports it can connect, and one account works with all of them.",
  "home.control.title": "You stay in control",
  "home.control.text": "See every connected app and revoke its access with one click. Follow each request in the live activity log, or turn on read-only mode. Verified dives stay locked.",

  // Try asking
  "home.examples.title": "Try asking",
  "home.examples.lead": "A few ideas to get you started. Your AI app picks the right tools by itself.",
  "home.examples.countYear": "How many dives did I log this year?",
  "home.examples.logDive": "Log yesterday's dive at the house reef, 18 m, 45 min.",
  "home.examples.deepest": "What was my deepest dive, and where was it?",
  "home.examples.yearReview": "Make a year in review of my diving.",
  "home.examples.certifications": "Which certifications do I have?",
  "home.examples.buddy": "Add my buddy Sam to my last dive.",

  // How it works
  "home.how.title": "How it works",
  "home.how.lead": "Setup takes a few minutes, and you only do it once.",
  "home.how.step1.titleRequest": "Request access",
  "home.how.step1.titleCreate": "Create an account",
  "home.how.step1.titleClosed": "Get an account",
  "home.how.step1.request": "Send a short request. Once the administrator approves it, you can sign in.",
  "home.how.step1.open": "Sign up on this server with your email address and a new password. This is not your PADI account.",
  "home.how.step1.invite": "Sign up with your email address and the invite code you got from the administrator.",
  "home.how.step1.closed": "Sign-up is closed on this server. Ask the administrator for an account.",
  "home.how.step2.title": "Connect your PADI account",
  "home.how.step2.text": "Sign in with the e-mail address and password you use on padi.com. The password is used once and never stored. If you sign in to PADI with Google, Apple or Facebook, first set a password at <a href=\"{url}\">account.padi.com</a>.",
  "home.how.step3.title": "Connect your AI app",
  "home.how.step3.text": "Add this server to your AI app, then sign in and approve access when the app asks. Your account page has one-click links and step-by-step help for the common apps.",
  "home.how.address": "The address of this server for your AI app:",
  "home.how.copy": "Copy",

  // Privacy and security
  "home.privacy.title": "Privacy and security",
  "home.privacy.lead": "Built so that your PADI account stays yours and you can see what happens.",
  "home.privacy.noPassword.title": "Your PADI password is not stored",
  "home.privacy.noPassword.text": "You type it once to sign in. This server keeps only the sign-in token that PADI gives back. Remove the connection on your account page at any time.",
  "home.privacy.encrypted.title": "Stored encrypted",
  "home.privacy.encrypted.text": "The sign-in token is encrypted with AES-256-GCM and is only used to talk to PADI for you.",
  "home.privacy.passThrough.title": "Your logbook is not kept here",
  "home.privacy.passThrough.text": "Your dives pass between PADI and your AI app and are not stored on this server. The activity log keeps only which app used which tool, when, how long it took and whether it worked.",
  "home.privacy.readOnly.title": "Read-only mode",
  "home.privacy.readOnly.text": "Turn it on and AI apps can read your logbook, but never add, change or delete a dive.",
  "home.privacy.approve.title": "You approve every app",
  "home.privacy.approve.text": "Each AI app must be approved by you before it can connect, and you can revoke its access at any time.",
  "home.privacy.more": "The details are in the <a href=\"/privacy\">privacy policy</a> and the <a href=\"/terms\">terms of use</a>.",

  // Questions and answers
  "home.faq.title": "Questions and answers",
  "home.faq.official.q": "Is this an official PADI service?",
  "home.faq.official.a": "No. MCP for PADI is an independent open-source project. It is not made by, affiliated with, or endorsed by PADI. It signs in with your own PADI account and uses your logbook the way the PADI website does, so it can stop working for a while when PADI changes its website.",
  "home.faq.password.q": "Is my PADI password stored?",
  "home.faq.password.a": "No. You type it once on your account page to sign in. This server keeps only the sign-in token that PADI gives back, encrypted. If you sign in to PADI with Google, Apple or Facebook, first set a password with \"Forgot password\" at <a href=\"{url}\">account.padi.com</a>.",
  "home.faq.changes.q": "What can the AI app change?",
  "home.faq.changes.a": "It can log new dives, change and delete the dives you logged, change the units of your logbook, and send a dive to a PADI Pro for verification. Deleting a dive needs the dive's title as confirmation, and sending a dive for verification needs your OK. Dives that are verified or waiting for verification are locked: it cannot change or delete them. Your certifications are only read.",
  "home.faq.readOnly.q": "What is read-only mode?",
  "home.faq.readOnly.a": "With read-only mode on, AI apps only get the tools that read: they can see your dives, statistics and certifications, but cannot add, change or delete anything. Turn it on or off on your account page at any time.",
  "home.faq.apps.q": "Which AI apps work?",
  "home.faq.apps.a": "Any app that can connect to a remote MCP server with sign-in (OAuth), for example Claude, ChatGPT, Gemini, Codex, Cursor, VS Code, Le Chat and Perplexity. Some apps offer custom connectors only on certain plans, in certain countries or behind a developer setting. Your account page has step-by-step help for each app.",
  "home.faq.operator.q": "Who runs this server?",
  "home.faq.operator.a": "This server is run by its administrator, who decides who can get an account. Your logbook passes through the server, so use one run by someone you trust, or run your own: the code is open source.",

  // End of the page
  "home.cta.title": "Bring your logbook to your AI assistant",
  "home.cta.request": "Send a request today. Once it is approved, you can connect your first AI app in a few minutes.",
  "home.cta.open": "Create your account and connect your first AI app in a few minutes.",
  "home.cta.invite": "Have an invite code? Create your account and connect your first AI app in a few minutes.",
  "home.cta.closed": "Sign in with your account to connect your AI app.",
};
