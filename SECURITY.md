# Security policy

MCP for PADI is an independent open-source project, maintained by one person (Marco Visin, Lugano, Switzerland) in his free time. It is not made by, affiliated with, or endorsed by PADI (Professional Association of Diving Instructors) or by any AI company. PADI is a registered trademark of PADI Worldwide Corp. Thank you for helping keep its users safe.

## How to report a problem

Send an e-mail to **[marco@visin.ch](mailto:marco@visin.ch)**. Please start the subject with `Security:`.

Please do **not** report security problems in public GitHub issues, pull requests or discussions. Tell me first, so that users are protected before the details are public.

Please include:

- What the problem is and what an attacker could do with it.
- Steps to reproduce it, and a proof of concept if you have one (requests and responses, a small script, screenshots). Remove passwords, tokens and other secrets first.
- Where you found it: the hosted service at https://padi.mcp.visin.ch, a copy you run yourself, or local mode.
- The version you tested (release, commit, or Docker image tag), if you know it.
- How you would like to be credited (name, handle, link), or that you prefer to stay anonymous.

You can write in English, Italian or German. If you need to send very sensitive details, say so in your first message and we will agree on a safe way to share them.

The same contact is published in machine-readable form at https://padi.mcp.visin.ch/.well-known/security.txt ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

## What is in scope

- **The web service** (the hosted service at https://padi.mcp.visin.ch and any copy run from this code): sign-up, sign-in, the account and admin pages, sessions and CSRF protection, and how the PADI sign-in is handled: the PADI password is used once and never stored, and the PADI refresh token is stored encrypted.
- **The OAuth server**: discovery documents, client registration and client metadata documents, the authorization and consent pages, and token issue, refresh and revocation.
- **The MCP endpoint** (`/mcp`): access control (each person must only ever reach their own PADI logbook), the logbook tools and their safety checks (locked dives, delete confirmation, read-only mode), and how free text from the logbook (dive titles, notes, buddies, locations) is passed to the AI app.
- **The PADI client**: that tokens and passwords never reach logs or tool results, that logs never contain e-mail addresses (tool results only show the signed-in user's own address, for example in `padi_account_info`), that the PADI affiliate id always comes from the user's own token, and that users cannot point the server at other hosts.
- **Local mode**: the stdio server, the single-user HTTP mode and its bearer token, read-only mode, and the token cache file (`PADI_TOKEN_CACHE`).
- The source code in this repository and the Docker image built from it (`ghcr.io/mrc527/padi-mcp`).

Not in scope:

- PADI's own services (learning.padi.com, account.padi.com, the PADI apps and their servers). Report those to PADI.
- The AI apps that connect to this server (Claude, ChatGPT and others). Report those to their makers.
- Prompt injection aimed at the AI model itself. Dive notes, buddy names and other logbook text can contain anything, and how the model reacts to them is up to the AI app. Problems in how this server marks that content as untrusted are in scope.
- Copies of this software run by other people. Report those to whoever runs them, but please tell me too if the problem is in the code.
- Reports from automated scanners without a working example, and missing best practices with no real impact.

## Please do not

- Access, change or delete other people's data, or try to read other people's PADI sign-ins. Only test with accounts you own. If you reach data that is not yours by accident, stop, do not keep or share it, and tell me.
- Submit dives for verification to a real PADI Pro who did not agree to it: the Pro gets a real request.
- Run denial-of-service tests, load tests or heavy automated scans against the hosted service or against PADI. The hosted service is a small server shared by real people, and every request it makes goes to PADI with a real user's account. For this kind of testing, run your own copy against a local mock (see the [README](README.md)).
- Use social engineering, phishing or physical attacks against users or against me.

New accounts on the hosted service need the administrator's approval. If you need a test account there, ask at marco@visin.ch. A demo account with sample dives (no PADI account behind it) is the easiest way to test the tools.

## What to expect

This is a one-person project, so everything here is best effort:

- I will confirm that I received your report within a few days.
- I will look into it, tell you what I found, and keep you updated while I work on a fix.
- Serious problems come first, especially anything that exposes stored PADI sign-ins or lets one person reach another person's logbook.
- When a problem has put users' data at risk, I will tell the affected users.
- Please give me reasonable time to fix the problem before you publish details. We can agree on a date together; usually that is after the fix is live.

Only the latest version (the `main` branch, the latest Docker image and the hosted service) gets security fixes.

## Credit

If you want, I will thank you by name in the release notes or security advisory for the fix. There is no paid bug bounty: this is an unpaid open-source project.
