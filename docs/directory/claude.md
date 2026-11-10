# Claude Connectors Directory: submission texts for MCP for PADI

This file holds everything needed to submit **MCP for PADI** to the Claude Connectors Directory: the text to paste into each field of the form, the answers to choose, the instructions for the reviewers, and what to do before you submit.

- Form: https://claude.ai/directory/manage, then **Submit new** and **MCP connector**. You need a paid Claude plan (on Team or Enterprise, an Owner submits).
- Anthropic's guides: [Submit a connector](https://claude.com/docs/connectors/building/submission), [review criteria](https://claude.com/docs/connectors/building/review-criteria), [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
- Text inside a code block is meant to be pasted as it is. Character counts include spaces and line breaks.
- Never write the password of the demo account into this file: it is in the repository. Type it only into the form.
- **Read [Things a reviewer may question](#things-a-reviewer-may-question) first.** PADI has no public API, so the "First-party API usage" acknowledgment needs a decision before you start.

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

### 1. Decide whether to submit at all

- [ ] Read PADI's terms of use for its websites and apps. If they forbid access by other software in the way this server works (signing in as the user and calling the same API as the PADI web app), do not submit.
- [ ] Decide how to answer the "First-party API usage" acknowledgment (see [Things a reviewer may question](#things-a-reviewer-may-question)). If in doubt, ask mcp-review@anthropic.com before you submit.

### 2. Put the live site in order

- [ ] The service runs at https://padi.mcp.visin.ch with the name **MCP for PADI** everywhere: the start page, the footer (with the line that PADI has nothing to do with the project), the sign-in and consent pages, and the name the MCP server reports to Claude. The Tools step of the form reads the live server, so deploy first.
- [ ] https://padi.mcp.visin.ch/privacy names the controller as "Marco Visin, Lugano, Switzerland" and the contact marco@visin.ch, and says that the PADI password is never stored.
- [ ] https://padi.mcp.visin.ch/terms opens and says that the service is unofficial and not for dive planning or safety decisions.
- [ ] https://padi.mcp.visin.ch/.well-known/security.txt opens and shows `Contact: mailto:marco@visin.ch`.
- [ ] security.txt has no `Policy:` line while the repository is private (its GitHub page would answer 404). If you make the repository public, set `SECURITY_POLICY_URL` in `src/web/security-txt.ts` to the SECURITY.md link.
- [ ] Decide the documentation link. The start page https://padi.mcp.visin.ch/ is public and explains what the service does, how to connect and the common questions. If you make the GitHub repository public, the README (https://github.com/Mrc527/PADI-MCP#readme) is more complete, with setup, tools, security and troubleshooting. Either works; the policy asks for a page that explains how it works, what it is for and how to fix problems.

### 3. Create the demo account

The reviewers test with a **demo account** that is built into our server. Its logbook is sample data that the server simulates in memory: no PADI account is needed, no real person's data is involved, and nothing the reviewers do ever reaches PADI or a PADI Pro. The server runs the same code and the same tools as for a real account, only with a simulated PADI backend.

1. [ ] Sign in at https://padi.mcp.visin.ch/admin as administrator.
2. [ ] Under **Demo account for app reviewers**, type an email address for signing in, for example `claude-review@visin.ch`, and click **Create demo account**. The address is only the sign-in name: the server never sends mail to it.
3. [ ] Copy the password that is shown: it is shown only once. The account is approved, is not an administrator and needs no PADI account.
4. [ ] Under **Users**, the account shows the badge "demo" and PADI "sample data". Do not use **Reset password** on it during the review: a reset also disconnects its apps.

What the demo account contains (the example prompts in this file depend on it). The dates are relative to the day of each reset, so they always look current. Every name, number and place is invented:

- **Diver:** "Alex Demo" (alex.demo@example.com), with an invented PADI affiliate id, time zone Europe/Zurich, metric units.
- **Dives:** 25 dives over about three years. An Open Water course at "Copper Quarry" and "Lake Serein" (training dives 1 to 4), two Advanced adventure dives ("Adventure Dive - Deep" and "Adventure Dive - Navigation"), holidays at invented sites such as "Lantern Reef", "Turtle Terrace", "Old Lighthouse Wall", "Ferry Wreck of Port Ardent", "Pelican Pinnacle" and "Manta Station Rock", and local lake and quarry dives.
- **Status:** most dives are published, the training dives and a few others are verified by the invented PADI Pro "Robin Example" (member number 900001), "Second dive of the weekend" waits for verification (Pending, so it is locked), and the newest dive, "Lake dive (to finish)", is a Draft.
- **eCards:** Open Water Diver, Advanced Open Water Diver and Enriched Air Diver.
- **PADI Pros for the lookup:** 900001 (Robin Example) and 900002 (Kai J. Sample).
- **Photos:** the demo dives have none, so `logbook_get_photos` answers that there are no photos.
- **Daily reset:** every change (new, changed and deleted dives, units, verification requests) is kept in memory only. Every day at 04:00 Swiss time, and whenever the server restarts, the account starts again from fresh sample data. The **Reset demo data now** button on the admin page does the same at once.
- **Nothing reaches anyone:** submitting a dive for verification works in the tools, but no PADI Pro gets a request.

### 4. Check the server settings

The demo account follows the server-wide settings, so check them before the review:

1. [ ] On https://padi.mcp.visin.ch/admin, under **Settings**, check: **Read-only for everyone** off (the reviewers must test the tools that write); **Allow dynamic client registration** on; **Allow client ID metadata documents** on; **Allowed AI apps (redirect hosts)** empty, or containing `claude.ai claude.com`. Leave **Who can create an account** as it is.

### 5. Test every tool once with Claude

The form asks you to confirm that you ran every tool. Do it with the demo account, so you test the reviewer's path at the same time.

1. [ ] In Claude: **Customize > Connectors > Add custom connector**, URL `https://padi.mcp.visin.ch/mcp`, keep the defaults, then **Connect**.
2. [ ] On the sign-in page, use the **demo account** (not your own), then click **Allow**.
3. [ ] In a new chat, run the prompts in [the tool test plan](#tool-test-plan), in that order. Check that each tool gives a sensible answer and no generic error.
4. [ ] On the admin page, click **Reset demo data now** next to the demo account, so the reviewers start from fresh sample data. (It also happens by itself every day at 04:00 Swiss time.)
5. [ ] Remove the custom connector from your Claude, and on the demo account's **Connected apps** page revoke the test connection, so the reviewers start clean.
6. [ ] Optional: also run every tool once in the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

### 6. Prepare the listing materials

- [ ] **Icon:** upload `docs/directory/icon-512.png` (512 x 512 PNG with transparent corners, made from `assets/brand/logo.svg` by `scripts/make-icons.mjs`). It is our own artwork, not PADI's logo. Smaller: https://padi.mcp.visin.ch/icon-192.png (192 x 192). If the form accepts SVG, https://padi.mcp.visin.ch/icon.svg is the sharpest.
- [ ] Have the demo account's email and password at hand for step 8.

---

## Step 1: Connection

| Field | Value |
| --- | --- |
| Server URL | `https://padi.mcp.visin.ch/mcp` |
| Users connect to different URLs | No. Everyone uses this one URL (single URL). |

## Step 2: Tools

Nothing to type: the tools sync from the server. Check that all **14 tools** appear with a title and that none is flagged. The server also offers two prompts, "Log a dive" and "Year in review". There are no resources.

| Tool | Title | readOnlyHint | destructiveHint | Talks to other people (openWorldHint) |
| --- | --- | --- | --- | --- |
| `padi_account_info` | PADI account info | true | false | false |
| `logbook_list_dives` | List dives | true | false | false |
| `logbook_get_dive` | Get dive | true | false | false |
| `logbook_stats` | Dive statistics | true | false | false |
| `logbook_search_dive_sites` | Search dive sites | true | false | false |
| `logbook_export_dives` | Export dives | true | false | false |
| `logbook_lookup_instructor` | Look up a PADI Pro | true | false | false |
| `padi_list_certifications` | List certifications | true | false | false |
| `logbook_get_photos` | Get dive photos | true | false | false |
| `logbook_create_dive` | Log a dive | false | false | false |
| `logbook_update_dive` | Update dive | false | false | false |
| `logbook_set_units` | Set logbook units | false | false | false |
| `logbook_submit_for_verification` | Submit dive for verification | false | false | true |
| `logbook_delete_dive` | Delete dive | false | true | false |

9 tools only read, 4 add or change things (`logbook_update_dive` and `logbook_set_units` are also marked idempotent), and 1 deletes. Sending a dive to a PADI Pro is marked as reaching another person, and deleting is marked destructive, so Claude asks before it runs them. Both also need an explicit confirmation in their arguments (`confirm: true`, and the dive's title).

If a user turns on read-only mode, the server offers only the 9 reading tools and the "Year in review" prompt. The demo account has read-only mode off, so the form sees all 14.

## Step 3: Listing

### Server name (12 of 100 characters)

```text
MCP for PADI
```

Use this exact name in every language. Do not write "PADI MCP", "PADI Logbook" or anything that starts with "PADI": the connector is not made by PADI.

### One-liner (159 of 200 characters)

```text
Your PADI online dive logbook in Claude: log dives in plain words, find and review past dives, see your statistics and certifications. Unofficial, not by PADI.
```

### Description (1,857 of 2,000 characters)

```text
MCP for PADI connects Claude to your own PADI online dive logbook, the logbook you see at learning.padi.com. Ask in your own words, and Claude does the work in your logbook.

Log dives: tell Claude about a dive ("yesterday, boat dive at the house reef, 18 m for 45 minutes, water 24 degrees") and it fills in the logbook entry for you, asking only for what is missing. Training dives can be saved as drafts.

Look back: find dives by date, place, buddy or text, read every detail of a dive, and get your statistics: number of dives, total bottom time, deepest and longest dive, by year, month or place. Export your dives as CSV or JSON, and list your PADI certification cards.

Keep it tidy: correct or complete a dive, switch the logbook between metric and imperial units, and, after you agree, send a dive to a PADI Pro for verification.

How to connect: create an account at padi.mcp.visin.ch (new accounts are approved by the administrator). On your account page, sign in to PADI once with your PADI e-mail and password. Then add the connector in Claude, sign in and click Allow.

You stay in control. Your account page lists every connected app, and you can revoke one with a click. An activity log shows which tool ran, when and whether it worked. Read-only mode lets Claude read but never change anything. Verified dives are locked, deleting a dive needs its title, and Claude asks before it deletes or sends anything to a PADI Pro.

Privacy: your PADI password is used once and never stored. Only an encrypted sign-in token (AES-256-GCM) is kept. Your dives pass between PADI and Claude and are not stored on the server. No ads, no tracking, and your data is never sold.

Not for dive planning or safety decisions. MCP for PADI is a free, independent project by Marco Visin in Lugano, Switzerland. It is not made by, affiliated with or endorsed by PADI.
```

### Categories (choose 1 to 5)

The category names are only shown in the form's list. Choose in this order, as far as they exist:

1. **Lifestyle** (or "Sports", "Hobbies")
2. **Productivity** (or "Productivity and tools")
3. **Travel**, if the list has it

Three categories are enough. Do not choose health, developer or data categories: the connector is a logbook for everyday divers.

### Links and contact

| Field | Value |
| --- | --- |
| Documentation URL | `https://padi.mcp.visin.ch/` (or `https://github.com/Mrc527/PADI-MCP#readme` if the repository is public) |
| Privacy policy URL | `https://padi.mcp.visin.ch/privacy` |
| Terms of service URL (if asked) | `https://padi.mcp.visin.ch/terms` |
| Support contact | `marco@visin.ch` |
| Security reports (if asked) | `marco@visin.ch`, subject starting with "Security:". Machine-readable: `https://padi.mcp.visin.ch/.well-known/security.txt` |
| Icon | `docs/directory/icon-512.png`, or `https://padi.mcp.visin.ch/icon-192.png` (see [Prepare the listing materials](#6-prepare-the-listing-materials)) |
| URL slug | `mcp-for-padi` (permanent once published, so check the spelling) |
| Allowed link URIs (if asked) | None. The server never opens links. (`logbook_get_dive` returns a link to the dive on learning.padi.com as text.) |
| Screenshots (if asked) | Not needed: this is a plain MCP server, not an MCP App. |

## Step 4: Use cases

### Primary use cases (585 characters)

```text
1. Logging: turn a plain description of a dive into a PADI logbook entry (site, date, depth, time, conditions, equipment, gas, buddies, notes), asking only for what is missing.
2. Looking back: find dives by date, place, buddy or text and read every detail of a dive.
3. Statistics: number of dives, total bottom time, deepest and longest dive, by year, month, place or dive type.
4. Housekeeping: correct dives, delete mistakes, switch units, export the logbook as CSV or JSON.
5. Certifications and verification: list PADI eCards, look up a PADI Pro and send a dive for verification.
```

### What users need before they connect (567 characters)

```text
- A PADI account with access to the online logbook at learning.padi.com, and its password. Accounts that sign in to PADI with Google, Apple or Facebook first set a PADI password with "Forgot password" on account.padi.com.
- A free account at https://padi.mcp.visin.ch. New accounts are approved by the administrator: send a short request on the site.
- On the account page there, sign in to PADI once with the PADI e-mail and password (the password is not stored).
No paid plan is needed for MCP for PADI. The user's Claude plan must allow custom or directory connectors.
```

### Does the connector read data, write data, or both?

Choose **Both**. If there is a text field:

```text
Both. It reads dives, statistics, dive sites, certification cards, dive photos and the logbook units. It writes when the user asks: it adds, changes and deletes dives, sets the logbook units, and sends a dive to a PADI Pro for verification after the user agrees. Verified dives are locked and never changed. Each user can turn on read-only mode, which removes every tool that writes.
```

### Example prompts

The policy asks for at least three working examples. All of these work with the demo account.

```text
How many dives have I logged, and what is my total bottom time?
```

```text
What was my deepest dive, and where was it?
```

```text
Show me my last five dives.
```

```text
Give me a review of my diving last year.
```

```text
Log a dive from yesterday at Anchor Rock: shore dive, 14 m for 42 minutes, water 19 degrees, good visibility.
```

```text
Which PADI certifications do I have?
```

```text
Find dive sites with "reef" in the name.
```

```text
Export all my dives from this year as CSV.
```

## Step 5: Company

| Field | Value |
| --- | --- |
| Company name | `Marco Visin` (an individual developer, no company) |
| Location (if asked) | `Lugano, Switzerland` |
| Website | `https://padi.mcp.visin.ch` |
| Primary contact | `Marco Visin`, `marco@visin.ch` |

## Step 6: Authentication

| Field | Choose |
| --- | --- |
| Authentication requirement | **Required**. Every request to `/mcp` needs a token; without one the server answers 401 with a pointer to its OAuth metadata. |
| Authentication method | **OAuth**, with **Client ID Metadata Document (CIMD)** and **Dynamic Client Registration (DCR)**. Both are on. |
| OAuth client ID and secret for Anthropic to hold | Leave empty. Claude identifies itself with its published identity (CIMD) or registers itself (DCR), so no fixed client is needed. |

If there is a text field for details:

```text
The server is its own OAuth 2.1 authorization server, built to the MCP authorization specification. Claude can identify itself with its Client ID Metadata Document (its published identity) or with dynamic client registration; both are enabled. Authorization code flow with PKCE (S256), a consent page that shows the app and where it returns to, single-use codes, tokens bound to https://padi.mcp.visin.ch/mcp (RFC 8707), rotating refresh tokens with reuse detection, and revocation. Metadata: https://padi.mcp.visin.ch/.well-known/oauth-protected-resource and https://padi.mcp.visin.ch/.well-known/oauth-authorization-server. Users sign in to Claude's connector with their account on padi.mcp.visin.ch. Claude never sees their PADI password: they enter it once on our account page, we use it to sign in to PADI and keep only an encrypted PADI refresh token.
```

## Step 7: Data handling

### Where does the underlying API come from?

Choose **a third party's API that you don't control** (PADI). The honest picture:

- The connector, its OAuth sign-in and the domain padi.mcp.visin.ch are **ours**.
- The dives live in each user's own PADI logbook at **PADI**, which we do not control and have no agreement with. So it is not "our own API", and not "a partner's API with permission".
- PADI offers **no public API** and no way for other apps to ask for access. We use the same API that the PADI web app (learning.padi.com) uses, signed in as the user's own PADI account with the user's own e-mail and password. We do not read web pages, we do not use shared or stolen credentials, and each user only ever reaches their own logbook.
- The demo account for the review is the exception: it reaches no API at all. Its logbook is sample data simulated inside our server, kept in memory only and reset every day.

If there is a text field (814 characters):

```text
The MCP server, its OAuth sign-in and the domain padi.mcp.visin.ch are our own. The dives live in each user's own PADI logbook at PADI (Professional Association of Diving Instructors), a third party we do not control and have no agreement with. PADI offers no public API. We use the same API that PADI's own web app at learning.padi.com uses, signed in as the user's own PADI account: the user enters their PADI e-mail and password once on our account page, we sign in to PADI, never store the password, and keep only the PADI refresh token, encrypted with AES-256-GCM. We do not store dives, notes, photos or certifications: they pass between PADI and Claude while a request runs. Each user only ever reaches their own logbook. PADI can change its API at any time; then the connector stops working until we update it.
```

### Personal health data

Choose **No**. A dive log records sport activity (place, date, depth, time, conditions, equipment), not medical data. The PADI logbook has no health fields, and the connector does not ask for, analyze or store health information. (A user can type anything into a dive's notes, but notes only pass through.)

### Sponsored content

Choose **No**. There are no ads, no sponsored content and no promotions, in the tools or on the site.

### Data handling summary (if asked)

```text
Stored: the user's account on our server (email, scrypt password hash), their PADI connection (PADI e-mail, name, PADI affiliate id, units, read-only setting and the PADI refresh token, all encrypted with AES-256-GCM; the PADI password is never stored), the connected apps (tokens only as hashes), and an activity log of tool calls (time, app, tool, duration, success; no content), kept 90 days. Not stored: dives, notes, photos and certifications. Shared with: PADI (to reach the user's logbook) and the AI apps the user approves. Access requests (email address and message) are kept until answered, or 30 days; if e-mail notices are on, they are e-mailed to the administrator through our own mail server. No ads, no tracking, no selling, no AI training. Users can revoke apps and delete their account and data at any time. Details: https://padi.mcp.visin.ch/privacy
```

## Step 8: Test and launch

### Reviewer access instructions

Replace the two values in square brackets before you paste. Do not save the filled-in version in the repository.

```text
MCP for PADI connects Claude to a diver's own PADI online dive logbook. It is an independent project, not made by PADI. For the review we prepared a demo account on our server. Its logbook is sample data built into the server: no PADI account is connected, it contains no real person's data, and nothing you do reaches PADI or a PADI Pro.

Demo account on our server (this is NOT a PADI account):
Email: [DEMO ACCOUNT EMAIL]
Password: [DEMO ACCOUNT PASSWORD]

How to connect:
1. In Claude, open Customize > Connectors and add the connector (or Add custom connector with the URL https://padi.mcp.visin.ch/mcp). Keep the default settings.
2. Click Connect. A window opens on padi.mcp.visin.ch with "Sign in". Sign in with the demo account above. Do not create a new account.
3. The next page asks "Allow access to your PADI logbook?" and shows that you return to claude.ai. Click Allow.
4. You are back in Claude and the tools are ready.

What to try:
- How many dives have I logged, and what is my total bottom time?
- What was my deepest dive, and where was it?
- Show me my last five dives.
- Give me a review of my diving last year.
- Log a dive from yesterday at Anchor Rock: shore dive, 14 m for 42 minutes, water 19 degrees, good visibility.
- Which PADI certifications do I have?
- Find dive sites with "reef" in the name.
- Export all my dives from this year as CSV.

About the demo data:
- The diver is "Alex Demo" (alex.demo@example.com) in the time zone Europe/Zurich, with metric units. The logbook has 25 invented dives over about three years: an Open Water course, two Advanced adventure dives, holidays on invented reefs and wrecks, and lake and quarry dives. Every name, number and place is invented.
- Most dives are published. The training dives and some others are verified by the invented PADI Pro "Robin Example" (member number 900001), "Second dive of the weekend" waits for verification and the newest dive is a Draft. Verified and pending dives are locked: the tools refuse to change or delete them, as PADI does.
- There are three eCards (Open Water, Advanced Open Water, Enriched Air). The demo dives have no photos.
- Sending a dive for verification works, but no PADI Pro gets a request. Use member number 900001 or 900002.
- Every change is kept in memory only. The data is reset to fresh sample data every day at 04:00 Swiss time (CET/CEST), so changes from one day are gone the next.

Optional: sign in at https://padi.mcp.visin.ch/login with the same account to see the Connected apps page (revoke access with one click), the activity log, and the read-only switch on the account page. Please do not change the password and do not delete the account.

Questions or problems: marco@visin.ch. We can reset the demo data at any time.
```

### Confirmation that every tool was run

Tick it only after you ran the whole test plan below with Claude (see [Test every tool once with Claude](#5-test-every-tool-once-with-claude)).

### Tool test plan

Run these in one chat, in this order, signed in as the demo account. Claude will ask before the tools marked as destructive or reaching other people: allow them.

| # | Prompt | Tool it should use |
| --- | --- | --- |
| 1 | Check my PADI connection and tell me who is signed in and which units I use. | `padi_account_info` |
| 2 | Show me my last five dives. | `logbook_list_dives` |
| 3 | Show me every detail of the dive "Ferry wreck". | `logbook_get_dive` |
| 4 | How many dives did I log per year, and what is my total bottom time? | `logbook_stats` |
| 5 | Find dive sites with "reef" in the name. | `logbook_search_dive_sites` |
| 6 | Export all my dives as CSV. | `logbook_export_dives` |
| 7 | Who is the PADI Pro with member number 900001? | `logbook_lookup_instructor` |
| 8 | Which PADI certifications do I have? | `padi_list_certifications` |
| 9 | Show me the photos of my newest published dive. | `logbook_get_photos` (answers that there are no photos) |
| 10 | Log a dive from yesterday at Anchor Rock: shore dive, 14 m for 42 minutes, water 19 degrees, good visibility, title "Test dive". | `logbook_create_dive` |
| 11 | Change the dive "Test dive": the maximum depth was 16 m, and add the note "Saw an octopus". | `logbook_update_dive` |
| 12 | Switch my logbook to imperial units. Then switch it back to metric. | `logbook_set_units` |
| 13 | Send the dive "Test dive" to the PADI Pro 900001 for verification. | `logbook_submit_for_verification` (after `logbook_lookup_instructor`) |
| 14 | Delete the dive "Lake dive (to finish)". | `logbook_delete_dive` |

Two checks that the guards work (optional): ask to change "Test dive" again after step 13 (it is Pending now, so the server refuses), and ask to delete a verified dive such as "Ferry wreck" (refused).

Afterwards, reset the demo data (see step 4 of [Test every tool once with Claude](#5-test-every-tool-once-with-claude)).

## Step 9: Compliance

All seven are required. Why we comply, one line each:

| Acknowledgment | Why we comply |
| --- | --- |
| Directory guidelines | Each tool does one clear thing, has a title and the right read-only, destructive or open-world hint, and its description says only what it does; we have a privacy policy, terms, a support contact and public documentation. |
| First-party API usage | **Decide before you tick.** We own and run the MCP server, its OAuth server and the domain padi.mcp.visin.ch, but the data comes from PADI's private API, which we do not own or control and which PADI does not offer to third parties. See [Things a reviewer may question](#things-a-reviewer-may-question). |
| Financial transactions | The connector cannot move money or make payments of any kind; it only reads and writes dive log entries. |
| AI media generation | It generates no images, video or audio; it only reads and writes dive log entries and shows the user's own dive photos. |
| Prompt injection | Tool descriptions contain no hidden or behavioral instructions; the server marks dive titles, notes, buddies and other logbook text as user data that must not be followed, and deleting and sending a dive to a PADI Pro are marked so that Claude asks first. |
| Conversation data collection | Tools take only the parameters they need; we never ask for chat history, memory or files, and we store no dives or prompts (the activity log keeps only time, app, tool, duration and success). |
| Public documentation | The start page https://padi.mcp.visin.ch/ explains what it does and how to connect, with the privacy policy, terms and security.txt public as well. |

## Step 10: Review and submit

- Read the summary once more. The form shows quality warnings (for example very short answers) and sends them to the reviewers, so fix them before you submit.
- After submitting, follow the status at https://claude.ai/directory/manage. For escalations: mcp-review@anthropic.com.
- Keep the demo account until the listing is published. After that, keep it for later reviews or delete it on the admin page.

---

## Things a reviewer may question

Short notes, so there are no surprises:

- **API ownership (the big one).** The policy (section 3F) says developers must own or control any API endpoint their software connects to. We own the MCP endpoint and the domain, but the data comes from PADI's servers, which we do not control. Unlike iCloud (where Apple documents app-specific passwords and standard protocols for other apps), PADI documents no way for other software to reach the logbook: we use the private API of PADI's own web app, as the signed-in user. That is a weaker position than MCP for iCloud. Our answer: each user connects only their own account with their own credentials, we never store the password, we send no more requests than the PADI web app would, and we say all this openly in step 7. If the acknowledgment's wording clearly excludes this, ask mcp-review@anthropic.com before you tick it, or do not submit and offer the connector only as a custom connector.
- **PADI's terms.** PADI's terms of use may limit automated access. Read them before you submit (see [Before you submit](#1-decide-whether-to-submit-at-all)). The project is unofficial, and every page says so.
- **The name and the logo.** "MCP for PADI" says what the connector is for; it does not use "PADI" as the product name, and the logo is our own (an open logbook with a wave and bubbles), not PADI's. The description says that the project is independent and not made by PADI.
- **Safety.** A dive logbook is a record of past dives. The listing, the terms and the README say that the connector is not for dive planning or safety decisions.
- **Writes to a real person.** `logbook_submit_for_verification` sends a real request to a PADI Pro. It is marked as reaching other people, needs `confirm: true`, and the server tells Claude to ask the user first. In the demo account no request leaves the server.
- **Sign-up needs approval.** New users must request access and wait for approval. The listing and the "what users need" answer say so, and the reviewers get an account that is already approved.
- **The demo account is simulated.** The reviewers' account does not connect to PADI: its logbook is simulated in memory inside our server, with invented sample data. The tools and the logbook code are the same as for real accounts, only the PADI backend is replaced. That way the reviewers can test every tool, including deleting and sending for verification, without a PADI account and without anything reaching a real person. Real users always connect their own PADI account.
- **Private repository.** If the GitHub repository stays private, the documentation link must be the start page, and security.txt keeps no `Policy:` line (already the case).
