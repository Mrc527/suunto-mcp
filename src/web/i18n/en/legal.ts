/**
 * English texts: legal (the privacy policy and the terms of use). Keys start with "legal.".
 *
 * These texts describe what the code really does (store.ts, session.ts, crypto.ts, server.ts,
 * src/suunto, deploy/server). When that changes, change them too, and the date in ../../operator.ts.
 *
 * Placeholders: {app} the product name (common.appName), {operator} the person who runs the
 * service, {site} the host name of this server, {email} the contact address (a mailto link),
 * {url} the Suunto website, {date} the date of the last change, {lifetime}, {access} and
 * {refresh} a duration (legal.duration.*), {name} the name of a cookie.
 */
export default {
  // Shared by both pages
  "legal.updated": "Last updated: {date}",
  "legal.onThisPage": "On this page",
  "legal.englishPrevails": "This page is also available in other languages. If a translation differs from the English version, the English version applies.",
  "legal.seeTerms": "See also the <a href=\"/terms\">terms of use</a>.",
  "legal.seePrivacy": "See also the <a href=\"/privacy\">privacy policy</a>.",
  "legal.duration.minutes.one": "{n} minute",
  "legal.duration.minutes.other": "{n} minutes",
  "legal.duration.hours.one": "{n} hour",
  "legal.duration.hours.other": "{n} hours",
  "legal.duration.days.one": "{n} day",
  "legal.duration.days.other": "{n} days",

  // Privacy policy
  "legal.privacy.title": "Privacy policy",
  "legal.privacy.intro": "This policy explains what {app} stores about you, why, for how long, and who else receives your data. In short: we keep only what the service needs, your Suunto password never reaches this server, your Suunto tokens are stored encrypted, and your workouts and health data are not stored.",

  "legal.privacy.controller.title": "Who is responsible",
  "legal.privacy.controller.text": "{app} at {site} is run by {operator}, Lugano, Switzerland. {operator} is responsible for your personal data: the controller under the Swiss Federal Act on Data Protection (FADP) and, where it applies, the EU General Data Protection Regulation (GDPR).",
  "legal.privacy.controller.contact": "For any question about your data, or to use your rights, write to {email}.",

  "legal.privacy.data.title": "What we store and why",
  "legal.privacy.data.lead": "We store only what the service needs to work:",
  "legal.privacy.data.account": "<strong>Your account.</strong> Your email address and the password you chose for {app}. The password is stored only as a scrypt hash, so we cannot see it. We also store when you created the account and last signed in, and whether it is disabled or an administrator account. We need this to give you an account and keep it secure.",
  "legal.privacy.data.request": "<strong>Your access request.</strong> If you request access, the message you write to the administrator, so the administrator can decide. It is deleted when your request is approved. If this service has a mail server set up and the administrator did not turn off e-mail notifications, your email address and this message are also sent to them by e-mail (see \"Who receives your data\"). When your request is approved and this service has a mail server set up, you get a welcome e-mail at your email address, in the language you used for the request (we save this language with your account).",
  "legal.privacy.data.invite": "<strong>Invite codes.</strong> If you sign up with an invite code, the invite records your email address and when you used it.",
  "legal.privacy.data.suunto": "<strong>Your Suunto connection.</strong> Your Suunto username, the access token and the refresh token that Suunto gives when you connect your account here, when the access token expires, whether the connection must be renewed, and your settings: units, read-only mode and time zone, with the time you connected and the result of the test request made then (how many workouts you had in the last 30 days, or why the request failed). They are stored encrypted with AES-256-GCM. You sign in on Suunto's own page, so your Suunto password never reaches this server. While you connect, we keep a hash of a one-time code that expires after 10 minutes, to check that the answer from Suunto belongs to you. We need this to reach your Suunto data for you.",
  "legal.privacy.data.apps": "<strong>Connected AI apps.</strong> When you connect an AI app, we store the app's registration (the name and web addresses it gives itself) and the tokens that let it act for your account. Tokens are stored only as hashes. We also store when each connection was made and last used, so you can see it and revoke it.",
  "legal.privacy.data.activity": "<strong>Activity log.</strong> For each action an AI app takes (a tool call, for example <code>suunto_list_workouts</code>), we record the time, the app, the tool, how long it took and whether it worked. We do not record what was read or written: no workouts, heart rate, sleep, locations, routes or points of interest. You see the latest entries on the Connected apps page, and we use the log to find errors and abuse. The administrator also sees statistics from it, per account and in total: how many actions, which tools and apps, and how many failed. We also count the requests sent to Suunto for your account, with only the time of each one, to keep the call limits per user. These counts are deleted after 8 days.",
  "legal.privacy.data.sessions": "<strong>Browser sessions.</strong> When you sign in, your browser gets a random session code in a cookie. We store only a hash of it, with the time it was created and when it expires.",
  "legal.privacy.data.ip": "<strong>IP address.</strong> Like every website, the server sees the IP address of each request. {app} keeps it only in memory, for at most one day, to limit repeated attempts such as too many sign-ins. It does not save it in its database or in its log.",
  "legal.privacy.data.log": "<strong>Server log.</strong> The server writes a short technical log of events such as a failed sign-in, a new account or an error. It contains no passwords, tokens, IP addresses or contents of your Suunto data. But when an action fails, the error message can include a short detail, such as a value that Suunto refused.",

  "legal.privacy.content.title": "Your workouts and health data are not stored",
  "legal.privacy.content.text": "When an AI app asks for your workouts, daily activity, heart rate, sleep, recovery, routes or points of interest, {app} gets them from Suunto and passes them on to the app. They are not saved in the database or on disk. This includes FIT files and the locations in your workouts and routes. To save calls to Suunto, recent answers are kept in the server's memory for 2 to 30 minutes (at most 20 MB per user) and are gone when the server restarts. The server log holds only the short error details described above. Your account page shows the result of the test request made when you connected, and never asks Suunto just to show the page.",
  "legal.privacy.content.sent": "Routes and points of interest that your AI app adds are saved in your Suunto account, as if you added them in the Suunto App, and can sync to your watch. {app} does not change or delete them later: you can delete them in the Suunto App.",

  "legal.privacy.bases.title": "Legal bases",
  "legal.privacy.bases.lead": "We process your data in line with the Swiss FADP. Where the GDPR applies, we rely on these legal bases:",
  "legal.privacy.bases.contract": "<strong>Contract</strong> (Art. 6(1)(b) GDPR): to provide the service you signed up for, that is your account, your Suunto connection, your connected apps and your activity log.",
  "legal.privacy.bases.health": "<strong>Your explicit consent</strong> (Art. 9(2)(a) GDPR) for health data, such as heart rate, sleep and recovery: you give it when you connect your Suunto account and ask your AI app for this data. You can withdraw it at any time by removing the Suunto connection.",
  "legal.privacy.bases.interest": "<strong>Legitimate interest</strong> (Art. 6(1)(f) GDPR): to keep the service secure and running, with limits on repeated attempts, the server log, backups and protection against abuse.",
  "legal.privacy.bases.law": "<strong>Legal obligation</strong> (Art. 6(1)(c) GDPR): when the law requires us to keep or hand over data.",

  "legal.privacy.retention.title": "How long we keep data",
  "legal.privacy.retention.account": "<strong>Account:</strong> until you delete it, or the administrator does.",
  "legal.privacy.retention.suunto": "<strong>Suunto connection:</strong> until you remove it on the Suunto account page or delete your account. The tokens are then deleted from this server, and {app} asks Suunto to end the connection. A one-time code used while connecting is deleted when it is used, and expired codes are deleted regularly.",
  "legal.privacy.retention.request": "<strong>Access requests:</strong> deleted at once if rejected, and after 30 days if nobody answers. The message to the administrator is deleted when the request is approved. A notification e-mail about a request stays in the administrator's mailbox until they delete it.",
  "legal.privacy.retention.sessions": "<strong>Browser sessions:</strong> until you sign out, at most {lifetime}.",
  "legal.privacy.retention.tokens": "<strong>App connections:</strong> an access token is valid for {access}. A connection ends when you revoke it, or after {refresh} without use. Each token is deleted one day after it expires.",
  "legal.privacy.retention.clients": "<strong>App registrations</strong> (not linked to your account): deleted after one day if nobody approved the app, otherwise once no connection uses it, at the earliest 90 days after it was first approved.",
  "legal.privacy.retention.activity": "<strong>Activity log:</strong> 90 days. <strong>Counts of Suunto requests:</strong> 8 days.",
  "legal.privacy.retention.invites": "<strong>Invites:</strong> until the administrator deletes the invite. Deleting your account does not remove your email address from an invite you used, so write to us and we will delete it.",
  "legal.privacy.retention.log": "<strong>Server log:</strong> kept in files of limited size (50 MB in total). The oldest entries are overwritten.",
  "legal.privacy.retention.backups": "<strong>Backups:</strong> a copy of the database is made before each software update or rollback, or by hand, and only the 10 newest copies are kept. They are kept on the same server. Data you delete can remain in these copies until they are replaced. Your Suunto connection stays encrypted in them.",

  "legal.privacy.recipients.title": "Who receives your data",
  "legal.privacy.recipients.lead": "We do not sell your data, do not share it with advertisers and do not use it to train AI models. Your data goes only to:",
  "legal.privacy.recipients.suunto": "<strong>Suunto.</strong> To reach your data, {app} sends Suunto the requests that you or your AI apps make, with your access token and the key of this service: reading workouts, FIT files, daily activity, heart rate, sleep, recovery, routes and points of interest, and adding routes and points of interest. Suunto Oy is an independent controller of the data in your Suunto account and handles it under its own privacy policy.",
  "legal.privacy.recipients.apps": "<strong>The AI apps you connect.</strong> Each app you approve, for example Claude by Anthropic or ChatGPT by OpenAI, receives the workout, health, route and point of interest data it asks for and the results of its actions. What the app does with this data is governed by its own terms and privacy policy and by your settings in that app. We have no control over it.",
  "legal.privacy.recipients.hosting": "<strong>Our hosting provider.</strong> {app} runs on a server rented from a cloud hosting provider. The provider stores the data for us and is not allowed to use it for its own purposes.",
  "legal.privacy.recipients.admin": "<strong>The administrator.</strong> The administrator of {app} sees a list of accounts with the email address, status, whether Suunto is connected, the last sign-in, the number of tool calls in the last 7 days, and the messages in access requests. The admin pages never show your Suunto tokens or your Suunto data. If this service has a mail server set up and the administrator did not turn off e-mail notifications about access requests (they are on by default), they also get the email address and the message of each new request by e-mail, sent through the mail server of this service.",
  "legal.privacy.recipients.authorities": "<strong>Authorities</strong>, only when the law requires it.",
  "legal.privacy.recipients.noTracking": "We use no analytics, advertising or tracking services, and these pages load nothing from other websites.",

  "legal.privacy.transfers.title": "Data in other countries",
  "legal.privacy.transfers.text": "The data that {app} stores is kept on its server and in its backups, at the hosting provider. Suunto and the AI apps you connect may process your data in other countries, including the United States. This happens because you choose to use their services. If you request access, your email address and message may be e-mailed to the administrator, and a welcome e-mail may be sent to your address once you are approved, so the provider of the mail server may process them too. Their privacy policies explain where they process data and how they protect it.",

  "legal.privacy.security.title": "How we protect your data",
  "legal.privacy.security.encryption": "Your Suunto connection, with its tokens, is encrypted with AES-256-GCM. Passwords for {app} are hashed with scrypt, and session codes, tokens and invite codes are stored only as hashes.",
  "legal.privacy.security.transport": "Connections to {app} use HTTPS, and connections to Suunto use HTTPS too.",
  "legal.privacy.security.web": "Forms are protected against forged requests, the pages run under a strict content security policy, and repeated attempts are limited.",
  "legal.privacy.security.server": "The service runs in a locked-down container with no extra rights, and its file system is read-only except for its data folder.",
  "legal.privacy.security.token": "Because {app} talks to Suunto for you, the server holds the encryption key and can decrypt your Suunto tokens. That is why it never asks for your Suunto password, only for the tokens, which you can remove at any time on the <a href=\"/account\">Suunto account</a> page.",
  "legal.privacy.security.report": "No system is perfectly secure. If you find a security problem, please report it to {email}. We will reply as soon as we can and fix confirmed problems.",

  "legal.privacy.rights.title": "Your rights",
  "legal.privacy.rights.lead": "You have the right to know what data we hold about you, to get a copy, to have it corrected or deleted, to restrict or object to its use, and to take it elsewhere. You can do much of this yourself:",
  "legal.privacy.rights.suunto": "Change your Suunto connection, or remove it, on the <a href=\"/account\">Suunto account</a> page. For the data in your Suunto account itself, use the Suunto App or ask Suunto.",
  "legal.privacy.rights.apps": "See your connected apps and the activity log, and revoke any app, on the <a href=\"/account/connections\">Connected apps</a> page.",
  "legal.privacy.rights.delete": "Delete your account on the <a href=\"/account/security\">Security</a> page. This deletes your account, your Suunto connection, your sessions, your app connections and your activity log at once. Copies in the backups disappear as the backups are replaced. Your data at Suunto is not touched.",
  "legal.privacy.rights.email": "For anything else, write to {email}. We answer within 30 days.",
  "legal.privacy.rights.complaint": "You can also complain to a data protection authority: in Switzerland the Federal Data Protection and Information Commissioner (FDPIC), in the EU the authority of the country where you live or work.",

  "legal.privacy.cookies.title": "Cookies",
  "legal.privacy.cookies.lead": "{app} uses only the cookies it needs to work. There are no tracking or advertising cookies. The cookies are sent only to this site, cannot be read by scripts on the page and are not shared with anyone.",
  "legal.privacy.cookies.session": "{name} keeps you signed in. It is deleted when you sign out and lasts at most {lifetime}.",
  "legal.privacy.cookies.pre": "{name} protects the sign-in and sign-up forms against forged requests. It lasts {lifetime}.",
  "legal.privacy.cookies.lang": "{name} remembers the language you chose in the language menu. It lasts {lifetime}.",

  "legal.privacy.children.title": "Children",
  "legal.privacy.children.text": "{app} is not meant for children. You must be at least 16 years old to use it. If you think a child has created an account, write to us and we will delete it.",

  "legal.privacy.changes.title": "Changes to this policy",
  "legal.privacy.changes.text": "We update this policy when the service or the law changes. The date at the top shows the last change. If a change affects how your data is used, we will point it out on this site.",

  // Terms of use
  "legal.terms.title": "Terms of use",
  "legal.terms.intro": "These terms apply to {app} at {site}. Please read them before you create an account. By using the service, you agree to them.",

  "legal.terms.service.title": "The service",
  "legal.terms.service.text": "{app} connects AI apps to your Suunto account through the official Suunto Cloud API. It is a free, independent open-source project run by {operator}, Lugano, Switzerland. There is no paid plan and no advertising.",

  "legal.terms.affiliation.title": "Not affiliated with Suunto or AI providers",
  "legal.terms.affiliation.text": "{app} is an independent open-source project. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto, Anthropic, OpenAI, Google or any other AI provider. Suunto is a registered trademark of Suunto Oy. {app} uses no Suunto artwork or logos. Other product names belong to their owners.",

  "legal.terms.account.title": "Your account",
  "legal.terms.account.age": "You must be at least 16 years old.",
  "legal.terms.account.secret": "Use an email address that is yours, and keep your password for {app} secret. Do not share your account. You are responsible for what happens with it.",
  "legal.terms.account.approval": "New accounts may need the administrator's approval or an invite code. Nobody has a right to an account.",

  "legal.terms.suunto.title": "Your Suunto account",
  "legal.terms.suunto.text": "You connect your own Suunto account on Suunto's sign-in page. Only connect a Suunto account that is yours. The terms of <a href=\"{url}\">Suunto</a> still apply to you. {app} depends on the Suunto Cloud API: when Suunto changes or limits it, or ends the access of this service, {app} can stop working or work differently.",

  "legal.terms.health.title": "Not medical advice",
  "legal.terms.health.text": "Heart rate, sleep, recovery, training and other values come from your watch and the Suunto App. {app} and your AI apps only pass them on and explain them, and AI apps can get them wrong. They are not medical advice and do not replace a doctor. Do not make decisions about your health on them alone.",

  "legal.terms.safety.title": "Not for navigation or safety decisions",
  "legal.terms.safety.text": "Routes, points of interest and locations can be wrong, out of date or unsafe, especially when an AI app made them. Do not rely on {app} or your AI apps for navigation or safety decisions. Check every route on a map before you follow it, and follow the conditions on the ground.",

  "legal.terms.ai.title": "What your AI apps do",
  "legal.terms.ai.access": "The AI apps you connect act for you. They can read your workouts, daily activity, heart rate, sleep, recovery, routes and points of interest and, unless you turn on read-only mode, add routes and points of interest to your Suunto App. AI apps make mistakes, for example in a distance, a date, a unit or a place.",
  "legal.terms.ai.responsible": "You decide which apps you connect and what you ask them to do, and you are responsible for the result. Routes and points of interest that your AI apps add to the Suunto App are your responsibility: check them in the Suunto App before you sync them to your watch or use them, and delete the ones you do not want. If your apps should only read, turn on read-only mode on the <a href=\"/account\">Suunto account</a> page. You can revoke an app's access at any time on the <a href=\"/account/connections\">Connected apps</a> page.",

  "legal.terms.use.title": "Acceptable use",
  "legal.terms.use.lead": "When you use {app}, do not:",
  "legal.terms.use.content": "add routes or points of interest that break the law or the rights of others",
  "legal.terms.use.law": "break the law, the terms of Suunto or the rights of others",
  "legal.terms.use.others": "reach accounts or data that you are not allowed to use",
  "legal.terms.use.harm": "overload or attack the service or the Suunto Cloud API, or get around their limits or their security",
  "legal.terms.use.report": "If you find a security problem, please report it to {email} instead of using it.",

  "legal.terms.availability.title": "Free, and without guarantees",
  "legal.terms.availability.text": "The service is free and provided as it is. We do our best to keep it running and secure, but we cannot promise that it is always available, free of errors or right for your purpose. We may change, limit or stop the service, or parts of it, at any time. If we stop it, we will try to announce it on this site in advance.",

  "legal.terms.admin.title": "What the administrator can do",
  "legal.terms.admin.text": "The administrator can approve or reject access requests, disable, enable and delete accounts, reset passwords, end app connections and change the server settings, for example turn on read-only mode for everyone. The administrator does this, for example, when these terms are broken, when an account seems to be in the wrong hands, or to protect the service and its users.",

  "legal.terms.end.title": "Ending your use",
  "legal.terms.end.text": "You can stop at any time: delete your account on the <a href=\"/account/security\">Security</a> page, and your data is deleted as described in the <a href=\"/privacy\">privacy policy</a>. We may suspend or delete your account if you break these terms, or when the service ends.",

  "legal.terms.liability.title": "Liability",
  "legal.terms.liability.text": "To the extent the law allows, {operator} is not liable for any damage caused by using {app} or by not being able to use it. This includes wrong or missing values, routes or points of interest that are wrong or unsafe, decisions about your health, training or safety, and lost data. This does not limit liability for intent or gross negligence, or any other liability that the law does not allow to exclude.",

  "legal.terms.privacy.title": "Privacy",
  "legal.terms.privacy.text": "The <a href=\"/privacy\">privacy policy</a> explains what data {app} stores, why, and for how long.",

  "legal.terms.changes.title": "Changes to these terms",
  "legal.terms.changes.text": "We may change these terms, for example when the service changes. The date at the top shows the last change. If you keep using {app} after a change, the new terms apply. If you do not agree with them, you can delete your account.",

  "legal.terms.law.title": "Applicable law",
  "legal.terms.law.text": "These terms are governed by Swiss law. The courts of Switzerland have jurisdiction, unless mandatory law says otherwise. If you are a consumer, you keep the protection of the mandatory laws of the country where you live.",

  "legal.terms.contact.title": "Contact",
  "legal.terms.contact.text": "Questions about these terms? Write to {operator} at {email}.",
};
