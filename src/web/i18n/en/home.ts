/** English texts: home (the start page for people who are not signed in). Keys start with "home.". */
export default {
  // Page
  "home.title": "Your Suunto data in your AI assistant",
  "home.description": "Connect Claude, ChatGPT and other AI apps to your Suunto account. Ask about your workouts, sleep and recovery, and send routes to your watch.",

  // Buttons (hero and the end of the page)
  "home.signIn": "Sign in",
  "home.requestAccess": "Request access",
  "home.createAccount": "Create an account",

  // Hero
  "home.hero.title": "Your Suunto training, inside your AI assistant.",
  "home.hero.lead": "Ask about your workouts, training load, sleep, recovery and steps in the AI apps you already use. Plan a route and send it to your watch. Connect once, then just ask.",
  "home.hero.worksWith": "Works with Claude, ChatGPT, Gemini, Codex, Cursor, VS Code and other AI apps",

  // Video (only shown when a video exists; there is none yet)
  "home.video.title": "See it in action",
  "home.video.text": "A short video about what MCP for Suunto can do and how to set it up.",
  "home.video.inEnglish": "This video is in English.",
  "home.video.unsupported": "Your browser cannot play this video. <a href=\"{url}\">Download it</a> instead.",

  // What you can do
  "home.features.title": "What you can do",
  "home.features.lead": "Ask in your own words, and your AI app finds the answer in your Suunto data.",
  "home.workouts.name": "Workouts",
  "home.workouts.text": "Find and read your workouts with time, distance, pace, heart rate, ascent and laps. Look at the heart rate or altitude along the way, and download a workout as a FIT file.",
  "home.health.name": "Sleep, recovery and steps",
  "home.health.text": "See how long and how well you slept, your recovery and stress during the day, your daily steps and energy, and your heart rate around the clock.",
  "home.routes.name": "Routes and places",
  "home.routes.text": "Plan a route with your AI app and add it to the Suunto App, ready to sync to your watch. Save points of interest such as a hut, a spring or a parking spot.",
  "home.stats.title": "Training load at a glance",
  "home.stats.text": "Time, distance, ascent and energy per week, month, year or sport, your longest and farthest workouts, and the recovery time your watch suggested, in metric or imperial units.",
  "home.anyApp.title": "Works with any AI app",
  "home.anyApp.text": "Built on the Model Context Protocol (MCP), the open standard that AI apps use to connect to tools and data. Any app that supports it can connect, and one account works with all of them.",
  "home.control.title": "You stay in control",
  "home.control.text": "See every connected app and revoke its access with one click. Follow each request in the live activity log, or turn on read-only mode so that nothing is added to your Suunto App.",
  "home.features.note": "Heart rate, sleep and recovery values come from your watch. They are not medical advice.",

  // Try asking
  "home.examples.title": "Try asking",
  "home.examples.lead": "A few ideas to get you started. Your AI app picks the right tools by itself.",
  "home.examples.month": "How much did I train this month compared to last month?",
  "home.examples.sleep": "How did I sleep this week, and how is my recovery?",
  "home.examples.longest": "What was my longest bike ride this year?",
  "home.examples.steps": "How many steps did I take each day last week?",
  "home.examples.route": "Plan a 12 km running loop around the lake and send it to my watch.",
  "home.examples.poi": "Save the mountain hut from my last hike as a point of interest.",

  // How it works
  "home.how.title": "How it works",
  "home.how.lead": "Setup takes a few minutes, and you only do it once.",
  "home.how.step1.titleRequest": "Request access",
  "home.how.step1.titleCreate": "Create an account",
  "home.how.step1.titleClosed": "Get an account",
  "home.how.step1.request": "Send a short request. Once the administrator approves it, you can sign in.",
  "home.how.step1.open": "Sign up on this server with your email address and a new password. This is not your Suunto account.",
  "home.how.step1.invite": "Sign up with your email address and the invite code you got from the administrator.",
  "home.how.step1.closed": "Sign-up is closed on this server. Ask the administrator for an account.",
  "home.how.step2.title": "Connect your Suunto account",
  "home.how.step2.connect": "Click \"Connect Suunto\" on your account page. Suunto's own sign-in page opens: sign in there and allow access. This site never sees your Suunto password.",
  "home.how.step3.title": "Connect your AI app",
  "home.how.step3.text": "Add this server to your AI app, then sign in and approve access when the app asks. Your account page has one-click links and step-by-step help for the common apps.",
  "home.how.address": "The address of this server for your AI app:",
  "home.how.copy": "Copy",

  // Privacy and security
  "home.privacy.title": "Privacy and security",
  "home.privacy.lead": "Built so that your Suunto account stays yours and you can see what happens.",
  "home.privacy.noPassword.title": "Your Suunto password stays with Suunto",
  "home.privacy.noPassword.text": "You sign in on Suunto's own page. This server only gets the access tokens that Suunto gives back. Remove the connection on your account page at any time.",
  "home.privacy.encrypted.title": "Stored encrypted",
  "home.privacy.encrypted.text": "The Suunto tokens are encrypted with AES-256-GCM and are only used to talk to Suunto for you.",
  "home.privacy.passThrough.title": "Your training data is not kept here",
  "home.privacy.passThrough.text": "Your workouts, sleep and other health data pass between Suunto and your AI app and are not stored on this server. The activity log keeps only which app used which tool, when, how long it took and whether it worked.",
  "home.privacy.readOnly.title": "Read-only mode",
  "home.privacy.readOnly.text": "Turn it on and AI apps can read your data, but never add a route or a point of interest to your Suunto App.",
  "home.privacy.approve.title": "You approve every app",
  "home.privacy.approve.text": "Each AI app must be approved by you before it can connect, and you can revoke its access at any time.",
  "home.privacy.more": "The details are in the <a href=\"/privacy\">privacy policy</a> and the <a href=\"/terms\">terms of use</a>.",

  // Questions and answers
  "home.faq.title": "Questions and answers",
  "home.faq.official.q": "Is this an official Suunto service?",
  "home.faq.official.a": "No. MCP for Suunto is an independent open-source project. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto.",
  "home.faq.sync.q": "Why is my latest workout missing?",
  "home.faq.sync.a": "Your AI app sees what is in your Suunto account. Sync your watch with the Suunto App first: new workouts, sleep and daily activity appear after the sync.",
  "home.faq.watches.q": "Which watches work?",
  "home.faq.watches.a": "Watches that sync with the Suunto App. What you can ask depends on what your watch records: for example, sleep, recovery and heart rate around the clock need a watch that measures them.",
  "home.faq.suuntoPassword.q": "Does this site see my Suunto password?",
  "home.faq.suuntoPassword.a": "No. You sign in on Suunto's own page, and Suunto sends this server only access tokens, which are stored encrypted. You can remove the connection at any time on your account page, and in the Suunto App.",
  "home.faq.changes.q": "What can the AI app change?",
  "home.faq.changes.a": "It can add routes and points of interest to your Suunto App, so that you can sync them to your watch. It cannot change or delete your workouts or any other data, and it cannot delete routes or points of interest: do that in the Suunto App. With read-only mode on (on your account page), it can only read.",
  "home.faq.medical.q": "Is this medical advice?",
  "home.faq.medical.a": "No. Heart rate, sleep, recovery and other values come from your watch, and your AI app explains them in its own words. They are not medical advice. Ask a doctor about your health.",
  "home.faq.data.q": "What does this site store about me?",
  "home.faq.data.a": "Only what it needs to work: your email address, a hash of your password, your Suunto username, your encrypted Suunto tokens, and a log of which tools were used and when. Your workouts and health data are fetched from Suunto when your AI app asks, and are not stored. The details are in the <a href=\"/privacy\">privacy policy</a>.",
  "home.faq.apps.q": "Which AI apps work?",
  "home.faq.apps.a": "Any app that can connect to a remote MCP server with sign-in (OAuth), for example Claude, ChatGPT, Gemini, Codex, Cursor, VS Code, Le Chat and Perplexity. Some apps offer custom connectors only on certain plans, in certain countries or behind a developer setting. Your account page has step-by-step help for each app.",
  "home.faq.operator.q": "Who runs this server?",
  "home.faq.operator.a": "This server is run by its administrator, who decides who can get an account. Your Suunto data passes through the server, so use one run by someone you trust. The code is open source, so anyone can check what it does.",

  // End of the page
  "home.cta.title": "Bring your Suunto data to your AI assistant",
  "home.cta.request": "Send a request today. Once it is approved, you can connect your first AI app in a few minutes.",
  "home.cta.open": "Create your account and connect your first AI app in a few minutes.",
  "home.cta.invite": "Have an invite code? Create your account and connect your first AI app in a few minutes.",
  "home.cta.closed": "Sign in with your account to connect your AI app.",
};
