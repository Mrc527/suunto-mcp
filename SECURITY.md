# Security policy

MCP for Suunto is an independent open-source project, maintained by one person (Marco Visin, Lugano, Switzerland) in his free time. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto, or by any AI company. Suunto is a registered trademark of Suunto Oy. Thank you for helping keep its users safe.

## How to report a problem

Send an e-mail to **[marco@visin.ch](mailto:marco@visin.ch)**. Please start the subject with `Security:`.

Please do **not** report security problems in public GitHub issues, pull requests or discussions. Tell me first, so that users are protected before the details are public.

Please include:

- What the problem is and what an attacker could do with it.
- Steps to reproduce it, and a proof of concept if you have one (requests and responses, a small script, screenshots). Remove passwords, tokens, keys and other secrets first.
- Where you found it: the hosted service at https://suunto.mcp.visin.ch, a copy you run yourself, or local mode.
- The version you tested (release, commit, or Docker image tag), if you know it.
- How you would like to be credited (name, handle, link), or that you prefer to stay anonymous.

You can write in English, Italian or German. If you need to send very sensitive details, say so in your first message and we will agree on a safe way to share them.

The same contact is published in machine-readable form at https://suunto.mcp.visin.ch/.well-known/security.txt ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

## What is in scope

- **The web service** (the hosted service at https://suunto.mcp.visin.ch and any copy run from this code): sign-up, sign-in, the account and admin pages, sessions and CSRF protection, the Content Security Policy and the other security headers, the check of the `Host` header (the server answers only for its own host name, against DNS rebinding), and how the Suunto connection is handled: the Suunto password is typed only on Suunto's own page, the OAuth `state` parameter binds Suunto's answer to the user who started the connection (random, single use, valid for 10 minutes), the code from Suunto is exchanged once, and the Suunto tokens are stored encrypted (AES-256-GCM).
- **The operator's Suunto app keys**: the client secret and the subscription key live only in the server environment. They must never be stored in the database, shown on a page (also not on the admin page), sent to an AI app, or written to logs.
- **The OAuth server**: discovery documents, client registration and client metadata documents, the authorization and consent pages, and token issue, refresh and revocation.
- **The MCP endpoint** (`/mcp`): access control (each person must only ever reach their own Suunto data), the tools and their safety checks (read-only mode, the checks of GPX files before a route import), and how free text from Suunto (workout names and descriptions, route and point of interest names, GPX text) is passed to the AI app.
- **The Suunto client**: that tokens, the client secret and the subscription key never reach logs or tool results, that logs never contain e-mail addresses, that the Suunto account always comes from the user's own token, that users cannot point the server at other hosts, and the call limits (`SUUNTO_CALLS_PER_MINUTE`, `SUUNTO_CALLS_PER_USER_PER_DAY`) that keep one user from using up the Suunto quota that all users share.
- **Local mode**: the stdio server, the single-user HTTP mode and its bearer token, read-only mode, the token cache file (`SUUNTO_TOKEN_CACHE`, which several processes may share), and the one-time `--login` flow (its local listener and `state` check).
- The source code in this repository and the Docker image built from it (`ghcr.io/mrc527/suunto-mcp`), including the deploy scripts and the CI/CD workflows.

Not in scope:

- Suunto's own services (the Suunto App, suunto.com, the Suunto API Zone and the Suunto Cloud API itself). Report those to Suunto.
- The AI apps that connect to this server (Claude, ChatGPT and others). Report those to their makers.
- Prompt injection aimed at the AI model itself. Workout names, descriptions, route names and GPX files can contain anything, and how the model reacts to them is up to the AI app. Problems in how this server marks that content as untrusted are in scope.
- Copies of this software run by other people. Report those to whoever runs them, but please tell me too if the problem is in the code.
- Reports from automated scanners without a working example, and missing best practices with no real impact.

## Please do not

- Access, change or delete other people's data, or try to read other people's Suunto connections. Only test with accounts you own. If you reach data that is not yours by accident, stop, do not keep or share it, and tell me.
- Run denial-of-service tests, load tests or heavy automated scans against the hosted service or against Suunto. The hosted service is a small server shared by real people, and its calls to Suunto count against one shared API quota: heavy testing can lock every user out. For this kind of testing, run your own copy against the local mock of the Suunto API (see the [README](README.md)).
- Use social engineering, phishing or physical attacks against users or against me.

New accounts on the hosted service need the administrator's approval. If you need a test account there, ask at marco@visin.ch. A demo account with sample data (no Suunto account behind it, and nothing leaves the server) is the easiest way to test the tools.

## What to expect

This is a one-person project, so everything here is best effort:

- I will confirm that I received your report within a few days.
- I will look into it, tell you what I found, and keep you updated while I work on a fix.
- Serious problems come first, especially anything that exposes stored Suunto tokens, the client secret or the subscription key, or lets one person reach another person's Suunto data.
- When a problem has put users' data at risk, I will tell the affected users.
- Please give me reasonable time to fix the problem before you publish details. We can agree on a date together; usually that is after the fix is live.

Only the latest version (the `main` branch, the latest Docker image and the hosted service) gets security fixes.

## Credit

If you want, I will thank you by name in the release notes or security advisory for the fix. There is no paid bug bounty: this is an unpaid open-source project.
