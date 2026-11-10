# Claude Connectors Directory: submission texts for MCP for Suunto

This file holds everything needed to submit **MCP for Suunto** to the Claude Connectors Directory: the text to paste into each field of the form, the answers to choose, the instructions for the reviewers, and what to do before you submit.

- Form: https://claude.ai/directory/manage, then **Submit new** and **MCP connector**. You need a paid Claude plan (on Team or Enterprise, an Owner submits).
- Anthropic's guides: [Submit a connector](https://claude.com/docs/connectors/building/submission), [review criteria](https://claude.com/docs/connectors/building/review-criteria), [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
- Text inside a code block is meant to be pasted as it is. Character counts include spaces and line breaks.
- Never write the password of the demo account, or any Suunto key, into this file: it is in a public repository. Type them only into the form.
- The connector uses Suunto's official, documented API with its own partner keys, so the "First-party API usage" acknowledgment is simple. Two things need care instead: the **Production API** subscription at Suunto (see [Before you submit](#1-check-the-suunto-side)) and the **health data** question (see [Personal health data](#personal-health-data)).

Contents:

1. [Before you submit](#before-you-submit)
2. [Step 1: Connection](#step-1-connection)
3. [Step 2: Tools](#step-2-tools)
4. [Step 3: Listing](#step-3-listing)
5. [Step 4: Use cases](#step-4-use-cases)
6. [Step 5: Company](#step-5-company)
7. [Step 6: Authentication](#step-6-authentication)
8. [Step 7: Data handling](#step-7-data-handling)
9. [Step 8: Test and launch](#step-8-test-and-launch)
10. [Step 9: Compliance](#step-9-compliance)
11. [Step 10: Review and submit](#step-10-review-and-submit)
12. [Things a reviewer may question](#things-a-reviewer-may-question)

---

## Before you submit

Do these in order. Tick each one.

### 1. Check the Suunto side

- [ ] Suunto accepted the **Production API** subscription in the API Zone (https://apizone.suunto.com), and the server uses the production subscription key (`SUUNTO_SUBSCRIPTION_KEY`). The Developer API allows only 200 calls per week for the whole app: a public listing would use that up in hours, and real users would only see "call limit reached".
- [ ] After that, raise the server's own call limits to fit the production limits Suunto gives you: `SUUNTO_CALLS_PER_MINUTE` (default 10, the Developer limit), `SUUNTO_CALLS_PER_USER_PER_DAY` (default 100) and `SUUNTO_CALLS_PER_USER_PER_WEEK` (default 100) in `.env` on the server, or 0 for no limit. Then run `docker compose up -d` and check the **Call limits** line of the **Suunto API** card on the admin page. With the defaults, a reviewer who tests quickly with a real account can get "Suunto's call limit for this service is reached".
- [ ] The app information in the API Zone profile (the content form) is complete, and the app name there is the one users should see on Suunto's sign-in page.
- [ ] Suunto's API agreement allows this use (an AI assistant that reads the user's data on request and adds routes and points of interest), and allows the name "MCP for Suunto" for a partner app. If in doubt, ask your contact at Suunto before you submit.

### 2. Put the live site in order

- [ ] The service runs at https://suunto.mcp.visin.ch with the name **MCP for Suunto** everywhere: the start page, the footer (with the line that the project is independent and not made by Suunto), the sign-in and consent pages, and the name the MCP server reports to Claude. The Tools step of the form reads the live server, so deploy first.
- [ ] The admin page's **Suunto API** card shows that the three Suunto app keys are set and the call limits you chose, and connecting a real Suunto account works.
- [ ] https://suunto.mcp.visin.ch/privacy names the controller as "Marco Visin, Lugano, Switzerland" and the contact marco@visin.ch, says that the server never sees the Suunto password, and lists what is stored (e-mail, password hash, Suunto username and encrypted tokens, activity log) and that workout and health data are fetched on demand and never saved to disk (recent answers stay in memory for at most 30 minutes, to save calls to Suunto).
- [ ] https://suunto.mcp.visin.ch/terms opens and says that the service is unofficial, not medical advice, and not for navigation or safety decisions.
- [ ] https://suunto.mcp.visin.ch/.well-known/security.txt opens and shows `Contact: mailto:marco@visin.ch`.
- [ ] The GitHub repository is public, so security.txt can point to the policy: set `SECURITY_POLICY_URL` in `src/web/security-txt.ts` to `https://github.com/Mrc527/suunto-mcp/blob/main/SECURITY.md` once SECURITY.md is on `main`.
- [ ] Decide the documentation link. The README (https://github.com/Mrc527/suunto-mcp#readme) is public and complete: setup, tools, security and troubleshooting. The start page https://suunto.mcp.visin.ch/ also explains what the service does, how to connect and the common questions. Either works; the policy asks for a page that explains how it works, what it is for and how to fix problems.

### 3. Create the demo account

The reviewers test with a **demo account** that is built into our server. Its Suunto data is sample data that the server simulates in memory: no Suunto account is needed, no real person's data is involved, and nothing the reviewers do ever reaches Suunto or a watch. The server runs the same code and the same tools as for a real account, only with a simulated Suunto backend.

1. [ ] Sign in at https://suunto.mcp.visin.ch/admin as administrator.
2. [ ] Under **Demo account for app reviewers**, type an email address for signing in, for example `claude-review@visin.ch`, and click **Create demo account**. The address is only the sign-in name: the server never sends mail to it.
3. [ ] Copy the password that is shown: it is shown only once. The account is approved, is not an administrator and needs no Suunto account.
4. [ ] Under **Users**, the account shows the badge "demo" and Suunto "sample data". Do not use **Reset password** on it during the review: a reset also disconnects its apps.

What the demo account contains (the example prompts in this file depend on it). The dates are relative to the day of each reset, so they always look current. Every name, number and place is invented:

- **Athlete:** "Alex Demo" (Suunto username `alexdemo`, sign-in alex.demo@example.com), time zone Europe/Zurich, metric units.
- **Workouts:** about 120 days of training: running, trail running, cycling, hiking, open water and pool swimming, scuba diving, strength training, and cross-country skiing in winter. Workouts have heart rate, and the outdoor ones have altitude, speed and a GPS track.
- **Every day and night:** daily steps and energy, a sleep entry for every night (deep, light and REM sleep, heart rate, HRV, SpO2, quality), 24/7 samples every 10 minutes (heart rate, steps, energy, SpO2, HRV, altitude) and recovery every 30 minutes.
- **Routes and places:** 4 routes and 5 points of interest at invented places.
- **Daily reset:** every change (routes and points of interest added with the tools) is kept in memory only. Every day at 04:00 Swiss time, and whenever the server restarts, the account starts again from fresh sample data. The **Reset demo data now** button on the admin page does the same at once.
- **Nothing reaches anyone:** adding a route or a point of interest works in the tools, but nothing goes to Suunto, to a Suunto App or to a watch.

### 4. Check the server settings

The demo account follows the server-wide settings, so check them before the review:

1. [ ] On https://suunto.mcp.visin.ch/admin, under **Settings**, check: **Read-only for everyone** off (the reviewers must test the tools that write); **Allow dynamic client registration** on; **Allow client ID metadata documents** on; **Allowed AI apps (redirect hosts)** empty, or containing `claude.ai claude.com`. Leave **Who can create an account** as it is.

### 5. Test every tool once with Claude

The form asks you to confirm that you ran every tool. Do it with the demo account, so you test the reviewer's path at the same time.

1. [ ] In Claude: **Customize > Connectors > Add custom connector**, URL `https://suunto.mcp.visin.ch/mcp`, keep the defaults, then **Connect**.
2. [ ] On the sign-in page, use the **demo account** (not your own), then click **Allow**.
3. [ ] In a new chat, run the prompts in [the tool test plan](#tool-test-plan), in that order. Check that each tool gives a sensible answer and no generic error.
4. [ ] On the admin page, click **Reset demo data now** next to the demo account, so the reviewers start from fresh sample data. (It also happens by itself every day at 04:00 Swiss time.)
5. [ ] Remove the custom connector from your Claude, and on the demo account's **Connected apps** page revoke the test connection, so the reviewers start clean.
6. [ ] Optional: also run every tool once in the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).
7. [ ] Optional, with your own real account: connect Suunto on the account page and ask for your last workout, to check the production path end to end.

### 6. Prepare the listing materials

- [ ] **Icon:** upload `docs/directory/icon-512.png` (512 x 512 PNG with transparent corners, made from `assets/brand/logo.svg` by `scripts/make-icons.mjs`). It is our own artwork, not Suunto's logo. Smaller: https://suunto.mcp.visin.ch/icon-192.png (192 x 192). If the form accepts SVG, https://suunto.mcp.visin.ch/icon.svg is the sharpest.
- [ ] Have the demo account's email and password at hand for step 8.

---

## Step 1: Connection

| Field | Value |
| --- | --- |
| Server URL | `https://suunto.mcp.visin.ch/mcp` |
| Users connect to different URLs | No. Everyone uses this one URL (single URL). |

## Step 2: Tools

Nothing to type: the tools sync from the server. Check that all **14 tools** appear with a title and that none is flagged. The server also offers two prompts, "Training review" and "Sleep and recovery". There are no resources. The titles below are the ones the server reports (src/server.ts and src/activity/tools.ts).

| Tool | Title | readOnlyHint | destructiveHint | Talks to other people (openWorldHint) |
| --- | --- | --- | --- | --- |
| `suunto_account_info` | Suunto account info | true | false | false |
| `suunto_list_workouts` | List workouts | true | false | false |
| `suunto_get_workout` | Get workout | true | false | false |
| `suunto_workout_stats` | Workout statistics | true | false | false |
| `suunto_export_workout_fit` | Export workout as FIT | true | false | false |
| `suunto_daily_activity` | Daily activity | true | false | false |
| `suunto_activity_samples` | 24/7 activity samples | true | false | false |
| `suunto_sleep` | Sleep | true | false | false |
| `suunto_recovery` | Recovery | true | false | false |
| `suunto_list_routes` | List routes | true | false | false |
| `suunto_get_route` | Get route | true | false | false |
| `suunto_list_pois` | List points of interest | true | false | false |
| `suunto_import_route` | Add route | false | false | false |
| `suunto_create_poi` | Add point of interest | false | false | false |

12 tools only read, and 2 add things to the user's own Suunto App (a route, a point of interest). Nothing deletes or changes existing data, and nothing reaches other people. The server tells Claude to ask before it adds a route or a point of interest, unless the user asked for exactly that.

If a user turns on read-only mode, the server offers only the 12 reading tools and both prompts. The demo account has read-only mode off, so the form sees all 14.

## Step 3: Listing

### Server name (14 of 100 characters)

```text
MCP for Suunto
```

Use this exact name in every language. Do not write "Suunto MCP", "Suunto Connector" or anything that starts with "Suunto": the connector is not made by Suunto.

### One-liner (165 of 200 characters)

```text
Your Suunto workouts, sleep and recovery in Claude: review your training, find workouts, see trends, and add routes and places to the Suunto App. Not made by Suunto.
```

### Description (1,984 of 2,000 characters)

```text
MCP for Suunto connects Claude to your own Suunto data: the workouts, daily activity, sleep and recovery that your Suunto watch records and syncs to the Suunto App. Ask in your own words, and Claude finds the answer in your data.

Review your training: list workouts by date and sport, read every detail of a workout (laps, heart rate zones, pace, power, altitude, GPS track), and get statistics: number of workouts, time, distance, ascent and energy, per week, month, year or sport. Export a workout as a FIT file.

See your day and night: steps and energy per day, 24/7 heart rate, HRV and SpO2, each night's sleep (deep, light and REM sleep, heart rate, quality), and your recovery balance.

Plan ahead: list your routes and points of interest, and, when you ask, add a GPX route or a new point of interest to the Suunto App, from where it can sync to your watch.

How to connect: create an account at suunto.mcp.visin.ch (new accounts are approved by the administrator). On your account page, click Connect Suunto and allow access on Suunto's own sign-in page. Then add the connector in Claude, sign in and click Allow.

You stay in control. Your account page lists every connected app, and you can revoke one with a click. An activity log shows which tool ran, when and whether it worked. Read-only mode lets Claude read but never add anything. You can remove the Suunto connection at any time.

Privacy: the connector uses the official Suunto Cloud API. Your Suunto password stays with Suunto. Only encrypted sign-in tokens (AES-256-GCM) are kept. Your workouts and health data pass between Suunto and Claude: they are never saved to disk, and recent answers stay in memory for a few minutes only. No ads, no tracking, and your data is never sold.

Heart rate, sleep and recovery values come from your watch and are not medical advice. MCP for Suunto is a free, independent project by Marco Visin in Lugano, Switzerland. It is not made by, affiliated with or endorsed by Suunto.
```

### Categories (choose 1 to 5)

The category names are only shown in the form's list. Choose in this order, as far as they exist:

1. **Health and fitness** (or "Sports", "Fitness")
2. **Lifestyle**
3. **Productivity** (or "Productivity and tools")

Three categories are enough. Do not choose developer or data categories: the connector is for everyday athletes.

### Links and contact

| Field | Value |
| --- | --- |
| Documentation URL | `https://github.com/Mrc527/suunto-mcp#readme` (or the start page `https://suunto.mcp.visin.ch/`) |
| Privacy policy URL | `https://suunto.mcp.visin.ch/privacy` |
| Terms of service URL (if asked) | `https://suunto.mcp.visin.ch/terms` |
| Support contact | `marco@visin.ch` |
| Security reports (if asked) | `marco@visin.ch`, subject starting with "Security:". Machine-readable: `https://suunto.mcp.visin.ch/.well-known/security.txt` |
| Icon | `docs/directory/icon-512.png`, or `https://suunto.mcp.visin.ch/icon-192.png` (see [Prepare the listing materials](#6-prepare-the-listing-materials)) |
| URL slug | `mcp-for-suunto` (permanent once published, so check the spelling) |
| Allowed link URIs (if asked) | None. The server never opens links. |
| Screenshots (if asked) | Not needed: this is a plain MCP server, not an MCP App. |

## Step 4: Use cases

### Primary use cases (540 characters)

```text
1. Training review: list workouts by date and sport and read every detail of a workout (laps, heart rate zones, pace, power, GPS track).
2. Statistics and trends: number of workouts, time, distance, ascent and energy per week, month, year or sport.
3. Daily health view: steps and energy per day, 24/7 heart rate, HRV and SpO2.
4. Sleep and recovery: each night's sleep stages, heart rate and quality, and the recovery balance over time.
5. Planning: list routes and points of interest, and add a GPX route or a new point to the Suunto App.
```

### What users need before they connect (489 characters)

```text
- A Suunto watch that syncs with the Suunto App, and the Suunto App account (old Movescount accounts do not work).
- A free account at https://suunto.mcp.visin.ch. New accounts are approved by the administrator: send a short request on the site.
- On the account page there, click Connect Suunto once and allow access on Suunto's own sign-in page (the password stays with Suunto).
No paid plan is needed for MCP for Suunto. The user's Claude plan must allow custom or directory connectors.
```

### Does the connector read data, write data, or both?

Choose **Both**. If there is a text field:

```text
Both. It reads workouts (with laps, heart rate zones and sample streams), FIT files, daily steps and energy, 24/7 heart rate, HRV and SpO2, sleep, recovery, routes and points of interest. It writes only when the user asks: it adds a GPX route or a new point of interest to the user's Suunto App. It never changes or deletes existing data. Each user can turn on read-only mode, which removes both tools that write.
```

### Example prompts

The policy asks for at least three working examples. All of these work with the demo account.

```text
How many workouts did I do this month, and how far did I go in total?
```

```text
Show me my last five workouts.
```

```text
How did I sleep this week?
```

```text
Give me a review of my training last month.
```

```text
What was my longest run in the last 90 days, and what was my average heart rate?
```

```text
How has my recovery been over the last three days?
```

```text
How many steps did I take each day last week?
```

```text
Add a point of interest called "Picnic spot" at 47.3769, 8.5417 to my Suunto App.
```

## Step 5: Company

| Field | Value |
| --- | --- |
| Company name | `Marco Visin` (an individual developer, no company) |
| Location (if asked) | `Lugano, Switzerland` |
| Website | `https://suunto.mcp.visin.ch` |
| Primary contact | `Marco Visin`, `marco@visin.ch` |

## Step 6: Authentication

| Field | Choose |
| --- | --- |
| Authentication requirement | **Required**. Every request to `/mcp` needs a token; without one the server answers 401 with a pointer to its OAuth metadata. |
| Authentication method | **OAuth**, with **Client ID Metadata Document (CIMD)** and **Dynamic Client Registration (DCR)**. Both are on. |
| OAuth client ID and secret for Anthropic to hold | Leave empty. Claude identifies itself with its published identity (CIMD) or registers itself (DCR), so no fixed client is needed. |

If there is a text field for details:

```text
The server is its own OAuth 2.1 authorization server, built to the MCP authorization specification. Claude can identify itself with its Client ID Metadata Document (its published identity) or with dynamic client registration; both are enabled. Authorization code flow with PKCE (S256), a consent page that shows the app and where it returns to, single-use codes, tokens bound to https://suunto.mcp.visin.ch/mcp (RFC 8707), rotating refresh tokens with reuse detection, and revocation. Metadata: https://suunto.mcp.visin.ch/.well-known/oauth-protected-resource and https://suunto.mcp.visin.ch/.well-known/oauth-authorization-server. Users sign in to Claude's connector with their account on suunto.mcp.visin.ch. Claude never sees Suunto credentials or tokens: users connect Suunto once on our account page through Suunto's own OAuth 2.0 sign-in page, and we keep only the Suunto tokens, encrypted.
```

## Step 7: Data handling

### Where does the underlying API come from?

Choose the option for **a partner's API that you use with permission** (if the form has no such option, the one closest to "an official API offered to us by its owner"). The picture is simple:

- The connector, its OAuth sign-in and the domain suunto.mcp.visin.ch are **ours**.
- The data comes from the **Suunto Cloud API**, Suunto's official and documented API for partners (https://apizone.suunto.com). We use it as a member of the Suunto partner program, under Suunto's API agreement, with **our own partner keys** (client id, client secret and subscription key). We do not read web pages, use private app APIs or share anyone's credentials.
- Each user allows access to their own Suunto account on **Suunto's own OAuth 2.0 page**, and can remove it on our account page at any time. Each user only ever reaches their own data.
- The demo account for the review is the exception: it reaches no API at all. Its data is simulated inside our server, kept in memory only and reset every day.

If there is a text field (834 characters):

```text
The MCP server, its OAuth sign-in and the domain suunto.mcp.visin.ch are our own. The data comes from the Suunto Cloud API, Suunto's official and documented API for partners. We use it as a member of the Suunto partner program, under Suunto's API agreement, with our own partner keys. Each user allows access to their own Suunto account on Suunto's own OAuth 2.0 sign-in page; we never see the Suunto password and keep only the Suunto tokens, encrypted with AES-256-GCM. We never save workouts, heart rate, sleep, recovery or routes to disk or to a database: they pass between Suunto and Claude, and recent answers stay in the server's memory for at most 30 minutes to save calls to Suunto. Each user only ever reaches their own data, and can remove the Suunto connection on our account page at any time, which also ends it at Suunto.
```

### Personal health data

Choose **Yes**. Heart rate, HRV, SpO2, sleep and recovery measured by a sports watch are health-related data, even though they are fitness data and not medical records. If there is a text field (696 characters):

```text
Yes. The connector reads data that the user's own Suunto sports watch measures: heart rate (during workouts and 24/7), heart rate variability, blood oxygen (SpO2), sleep stages and recovery balance. It reads them only for the signed-in user, only when the user asks, and only from the user's own Suunto account. It never saves them to disk: they pass between Suunto and Claude, and recent answers stay in the server's memory for at most 30 minutes, to save calls to Suunto. It makes no diagnosis and gives no medical advice; the server instructions, the start page and the terms say that these values come from the watch and are not medical advice. No data is sold or used for ads or AI training.
```

### Sponsored content

Choose **No**. There are no ads, no sponsored content and no promotions, in the tools or on the site.

### Data handling summary (if asked)

```text
Stored: the user's account on our server (email, scrypt password hash), their Suunto connection (Suunto username, units, read-only setting, time zone and the Suunto tokens, all encrypted with AES-256-GCM; the Suunto password never reaches us), the connected apps (tokens only as hashes), and an activity log of tool calls (time, app, tool, duration, success; no content), kept 90 days. Not saved to disk: workouts, heart rate, sleep, recovery, routes and points of interest (recent answers stay in memory for at most 30 minutes, to save calls to Suunto). Shared with: Suunto (to read the user's data and to add the routes and points the user asks for) and the AI apps the user approves. Access requests (email address and message) are kept until answered, or 30 days; if e-mail notices are on, they are e-mailed to the administrator through our own mail server. No ads, no tracking, no selling, no AI training. Users can revoke apps, remove the Suunto connection and delete their account and data at any time. Details: https://suunto.mcp.visin.ch/privacy
```

## Step 8: Test and launch

### Reviewer access instructions

Replace the two values in square brackets before you paste. Do not save the filled-in version in the repository.

```text
MCP for Suunto connects Claude to a person's own Suunto data (workouts, daily activity, sleep, recovery, routes) through the official Suunto Cloud API. It is an independent project, not made by Suunto. For the review we prepared a demo account on our server. Its data is sample data built into the server: no Suunto account is connected, it contains no real person's data, and nothing you do reaches Suunto or a watch.

Demo account on our server (this is NOT a Suunto account):
Email: [DEMO ACCOUNT EMAIL]
Password: [DEMO ACCOUNT PASSWORD]

How to connect:
1. In Claude, open Customize > Connectors and add the connector (or Add custom connector with the URL https://suunto.mcp.visin.ch/mcp). Keep the default settings.
2. Click Connect. A window opens on suunto.mcp.visin.ch with "Sign in". Sign in with the demo account above. Do not create a new account.
3. The next page asks you to allow access to your Suunto data and shows that you return to claude.ai. Click Allow.
4. You are back in Claude and the tools are ready.

What to try:
- How many workouts did I do this month, and how far did I go in total?
- Show me my last five workouts.
- How did I sleep this week?
- Give me a review of my training last month.
- What was my longest run in the last 90 days, and what was my average heart rate?
- How has my recovery been over the last three days?
- How many steps did I take each day last week?
- Add a point of interest called "Picnic spot" at 47.3769, 8.5417 to my Suunto App.

About the demo data:
- The athlete is "Alex Demo" (Suunto username alexdemo) in the time zone Europe/Zurich, with metric units. There are about 120 days of invented workouts (running, trail running, cycling, hiking, swimming, scuba diving, strength training, and cross-country skiing in winter), sleep for every night, daily steps and energy, 24/7 heart rate, HRV and SpO2, recovery, 4 routes and 5 points of interest. Every name, number and place is invented.
- Adding a route or a point of interest works, but nothing goes to Suunto, a Suunto App or a watch.
- Every change is kept in memory only. The data is reset to fresh sample data every day at 04:00 Swiss time (CET/CEST), so changes from one day are gone the next.

Optional: sign in at https://suunto.mcp.visin.ch/login with the same account to see the Connected apps page (revoke access with one click), the activity log, and the read-only switch on the account page. Please do not change the password and do not delete the account.

Questions or problems: marco@visin.ch. We can reset the demo data at any time.
```

### Confirmation that every tool was run

Tick it only after you ran the whole test plan below with Claude (see [Test every tool once with Claude](#5-test-every-tool-once-with-claude)).

### Tool test plan

Run these in one chat, in this order, signed in as the demo account. Claude may ask before the two tools that add things: allow them.

| # | Prompt | Tool it should use |
| --- | --- | --- |
| 1 | Check my Suunto connection and tell me who is signed in and which units I use. | `suunto_account_info` |
| 2 | Show me my last five workouts. | `suunto_list_workouts` |
| 3 | Show me every detail of my most recent run, with its heart rate curve. | `suunto_get_workout` (with the heart_rate samples) |
| 4 | How many workouts did I do per month in the last 90 days, and how far did I go each month? | `suunto_workout_stats` |
| 5 | Export my most recent bike ride as a FIT file. | `suunto_export_workout_fit` |
| 6 | How many steps did I take each day last week? | `suunto_daily_activity` |
| 7 | Show my heart rate per hour for yesterday. | `suunto_activity_samples` |
| 8 | How did I sleep in the last 7 nights? | `suunto_sleep` |
| 9 | How has my recovery been over the last three days? | `suunto_recovery` |
| 10 | List my routes. | `suunto_list_routes` |
| 11 | Show me the first of those routes as a GPX file. | `suunto_get_route` |
| 12 | List my points of interest. | `suunto_list_pois` |
| 13 | Add a copy of that route to my Suunto App as a new route called "Test route". | `suunto_import_route` |
| 14 | Add a point of interest called "Picnic spot" at 47.3769, 8.5417 to my Suunto App. | `suunto_create_poi` |

Also try the two prompts once from Claude's prompt menu: "Training review" (for "last month") and "Sleep and recovery".

Afterwards, reset the demo data (see step 4 of [Test every tool once with Claude](#5-test-every-tool-once-with-claude)).

## Step 9: Compliance

All seven are required. Why we comply, one line each:

| Acknowledgment | Why we comply |
| --- | --- |
| Directory guidelines | Each tool does one clear thing, has a title and the right read-only hint, and its description says only what it does; we have a privacy policy, terms, a support contact and public documentation. |
| First-party API usage | We own and run the MCP server, its OAuth server and the domain suunto.mcp.visin.ch. The data comes from Suunto's official, documented Cloud API, which Suunto offers to partners; we use it with our own partner keys under Suunto's API agreement, and each user allows access on Suunto's own OAuth page. |
| Financial transactions | The connector cannot move money or make payments of any kind; it only reads fitness data and adds routes and points of interest. |
| AI media generation | It generates no images, video or audio; it only reads fitness data and passes on the user's own FIT and GPX files. |
| Prompt injection | Tool descriptions contain no hidden or behavioral instructions; the server marks workout names, descriptions, route names and GPX text as user data that must not be followed, and tells Claude to ask before it adds anything. |
| Conversation data collection | Tools take only the parameters they need; we never ask for chat history, memory or files, and we save no fitness data or prompts to disk (the activity log keeps only time, app, tool, duration and success). |
| Public documentation | The README https://github.com/Mrc527/suunto-mcp#readme and the start page https://suunto.mcp.visin.ch/ explain what it does and how to connect, with the privacy policy, terms and security.txt public as well. |

## Step 10: Review and submit

- Read the summary once more. The form shows quality warnings (for example very short answers) and sends them to the reviewers, so fix them before you submit.
- After submitting, follow the status at https://claude.ai/directory/manage. For escalations: mcp-review@anthropic.com.
- Keep the demo account until the listing is published. After that, keep it for later reviews or delete it on the admin page.

---

## Things a reviewer may question

Short notes, so there are no surprises:

- **Health data.** Heart rate, HRV, SpO2, sleep and recovery are health-related. We answer "Yes" to the health data question and explain it (step 7). The data comes from the user's own watch, is read only on request, is never saved to disk (only a short in-memory cache), and every page and the server instructions say that it is not medical advice.
- **API ownership.** Unlike a connector that scrapes a website, this one uses the API that Suunto documents and offers to partners, with our own partner keys and Suunto's OAuth sign-in. Users see the connection in their Suunto App's list of partner services once Suunto accepted the production subscription.
- **Rate limits.** The Suunto Developer API allows only 200 calls per week for the whole app. A short in-memory cache per user saves repeated calls, and the server spaces its own calls (by default 10 per minute for the whole server and 100 per user per day, so one account cannot use up everyone's quota), but that cannot make the Developer API enough for a public listing. Submit only after Suunto accepted the Production API subscription and the server's limits are raised to match (see [Check the Suunto side](#1-check-the-suunto-side)); otherwise the reviewers may see "call limit reached" with a real account. (The demo account is not affected: it makes no calls to Suunto and does not count.)
- **The name and the logo.** "MCP for Suunto" says what the connector is for; it does not use "Suunto" as the product name, and the logo is our own artwork, not Suunto's. The description says that the project is independent and not made by Suunto. Check that Suunto's partner rules allow the name.
- **Writes.** The only writes add a route or a point of interest to the user's own Suunto App, from where they can sync to the watch. Nothing is changed or deleted, and nothing reaches other people. A route or point added by mistake is removed in the Suunto App. Routes and points of interest are not for navigation or safety decisions, and the terms say so.
- **Sign-up needs approval.** New users must request access and wait for approval. The listing and the "what users need" answer say so, and the reviewers get an account that is already approved.
- **The demo account is simulated.** The reviewers' account does not connect to Suunto: its data is simulated in memory inside our server, with invented sample data. The tools and the service code are the same as for real accounts, only the Suunto backend is replaced. That way the reviewers can test every tool, including the two that add things, without a Suunto account and a watch, and without anything reaching Suunto. Real users always connect their own Suunto account.
