# MCP for PADI

**MCP for PADI** is an [MCP](https://modelcontextprotocol.io) server that lets **any AI app** (Claude, ChatGPT, Codex, VS Code, Cursor and others) read and manage your **PADI online dive logbook**, the logbook at [learning.padi.com/logbook](https://learning.padi.com/logbook). Ask in your own words: "How many dives did I log this year?", "Log yesterday's boat dive at the house reef, 18 m for 45 minutes", "Which was my deepest dive?".

You can use the hosted service at [padi.mcp.visin.ch](https://padi.mcp.visin.ch) (MCP address `https://padi.mcp.visin.ch/mcp`) or run your own copy. The command, the npm package and the Docker image are called `padi-mcp`.

> **Unofficial.** MCP for PADI is an independent open-source project by Marco Visin. It is not made by, affiliated with, or endorsed by PADI (Professional Association of Diving Instructors). PADI is a registered trademark of PADI Worldwide Corp.
>
> PADI has no public API. This server uses the same private API as the PADI web app, signed in as your own PADI account. PADI can change that API at any time, and then the server stops working until it is updated.
>
> **Not for dive planning or safety decisions.** The logbook is a record of past dives, and this software and the AI app can make mistakes. Never use it to plan a dive, to work out decompression, gas or no-stop limits, or for any other safety decision. Check what the AI writes into your logbook.

There are two ways to run it:

| | Web service (multi-user) | Local (single user) |
| --- | --- | --- |
| For | AI apps that connect to remote MCP servers (Claude, ChatGPT, Codex, VS Code, ...), shared by many people | Claude Desktop, Claude Code, Cursor, VS Code and other local MCP clients |
| Start with | `padi-mcp --web` (or Docker) | `padi-mcp` (stdio) |
| Sign-in to PADI | Each user connects their PADI account on the account page; only an encrypted refresh token is kept | Environment variables of one person |
| AI app sign-in | OAuth: each user creates an account and connects their AI app | None (stdio), or a bearer token (`--http`) |
| Settings | Web pages for users, plus an admin page | Environment variables |

What the AI can do:

| Area | What the AI can do |
| --- | --- |
| Logbook | List and search dives (by date, text, type, status), read every detail of a dive, export dives as CSV or JSON |
| Statistics | Number of dives, total bottom time, deepest and longest dive, averages, first and last dive, per year, month, location or dive type |
| Logging | Log new dives (recreational and training), change dives, delete dives, search PADI's dive site list |
| Verification | Look up a PADI Pro by member number and send a dive to them for verification |
| Certifications | List your PADI eCards (title, date, instructor, dive center, card image) |
| Settings | Read and set the units of the PADI logbook (metric or imperial) |
| Photos | Show the photos attached to a dive |

## Contents

- [Web service for AI apps (multi-user)](#web-service-for-ai-apps-multi-user)
  - [Deploy](#deploy)
  - [Deploy with GitHub Actions (CI/CD)](#deploy-with-github-actions-cicd)
  - [Connect an AI app](#connect-an-ai-app)
  - [Start page, languages and logo](#start-page-languages-and-logo)
  - [Admin page](#admin-page)
  - [Demo account](#demo-account)
  - [Web service configuration](#web-service-configuration)
  - [How sign-in to this server works (OAuth)](#how-sign-in-to-this-server-works-oauth)
- [How sign-in to PADI works and what is stored](#how-sign-in-to-padi-works-and-what-is-stored)
- [Local mode (single user)](#local-mode-single-user)
- [Client setup (local mode)](#client-setup-local-mode)
- [Configuration reference (local mode)](#configuration-reference-local-mode)
- [Tools](#tools)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Web service for AI apps (multi-user)

In web mode the server is a small website plus an MCP endpoint:

- People **create an account** on the website. On the account page they **connect their PADI account**: they type the e-mail and password they use on PADI and click **Save and test**. The server signs in to PADI right away and saves the connection only if that works. The password is used once and never stored: the server keeps only an encrypted PADI refresh token. They also choose the units (the PADI logbook setting, metric or imperial) and their time zone (it decides what "today" is), and can turn on read-only mode.
- Once connected, the account page shows the PADI name, the affiliate id, the number of dives and the last sign-in. Units, time zone and read-only can be changed there without signing in again. **Reconnect** signs in to PADI again (needed after a PADI password change), and **Remove** deletes the stored sign-in. If PADI ends the sign-in, the page and the AI app both say so, and the user signs in again with **Reconnect**.
- They add **one URL** (`https://your-server/mcp`) to their AI app (in Claude a **custom connector**). The app opens a sign-in window, they sign in to your server and click **Allow**. From then on the app works with *their* PADI logbook.
- An **admin page** controls who can sign up (request access with approval, invite codes, open, closed), read-only mode for everyone, which AI apps may connect, token lifetimes, users and connected apps.

### Deploy

Claude connects from Anthropic's cloud, so the server must be reachable on the internet over **HTTPS on port 443** with a normal certificate and a public IPv4 address.

**Docker Compose with automatic HTTPS (recommended).** Point a DNS name at your machine, open ports 80 and 443, then:

```bash
git clone https://github.com/Mrc527/PADI-MCP.git
cd PADI-MCP/deploy
cp .env.example .env        # set DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d
```

[Caddy](https://caddyserver.com) obtains the certificate. Open `https://DOMAIN`, sign in with the admin account, and you are done. Data (the SQLite database and the encryption key) lives in the `data` volume: **back it up**.

**Without Docker** (Node.js 22.13 or newer):

```bash
npm install && npm run build
PUBLIC_URL=https://padi-mcp.example.com TRUST_PROXY=1 DATA_DIR=/var/lib/padi-mcp \
  node dist/index.js --web --port 3000
```

Put it behind an HTTPS reverse proxy (see [deploy/nginx.conf.example](deploy/nginx.conf.example)): forward everything to port 3000, keep the `Host` header, allow at least 300 seconds read timeout and do not strip the `WWW-Authenticate` header. If you use Cloudflare, do not enable "Block AI bots" or "Bot Fight Mode" for this host: Claude's requests (User-Agent `Claude-User`, from `160.79.104.0/21` and `153.61.208.0/20`) would be blocked.

The server needs outbound HTTPS to:

- PADI's hosts (see [How sign-in to PADI works](#how-sign-in-to-padi-works-and-what-is-stored)).
- The hosts of the AI apps' client metadata documents. When an app connects with a `client_id` URL, the server fetches that document, for example from `claude.ai` or `chatgpt.com`. If the fetch fails, built-in copies of Claude's and ChatGPT's documents are used; other apps that sign in this way cannot connect without it.
- Its own `PUBLIC_URL`, for **Check public setup** on the admin page.
- Your SMTP server, only if you want e-mails about access requests.

It needs no other outbound access.

If no administrator is configured (both `ADMIN_EMAIL` and `ADMIN_PASSWORD`), the first person who signs up becomes the administrator. After that, the server works by approval: other people can **request access** (with an optional message), and an administrator approves or rejects each request on the admin page. You can switch to invite codes only, open sign-up or closed sign-up there.

### Deploy with GitHub Actions (CI/CD)

The workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) tests every pull request and deploys every push to `main` to your own server over SSH. The default server is `nebula.visin.ch`, and the hosted service runs there as `padi.mcp.visin.ch`.

What happens on a push to `main`:

1. **Test**: type check, build, unit tests and integration tests on Node.js 22 and 24. The integration tests run against an in-process mock of the PADI API (`PADI_MCP_IT=1`), so CI needs no PADI account and never talks to PADI.
2. **Image**: build the Docker image for `linux/amd64` and `linux/arm64` (so it runs on Intel/AMD and on ARM servers such as Oracle Cloud Ampere), start each one and check that it works (health check, sign-in page, OAuth discovery, MCP endpoint). Then publish it to `ghcr.io/mrc527/padi-mcp` with the tags `sha-<commit>` and `latest`.
3. **Deploy**: connect to the server over SSH (the server's host key is pinned), copy [deploy/server](deploy/server) to it and run `deploy.sh`, which:
   - pulls the new image by its digest. It uses the job's own token, which can read this repository and its packages and expires when the job ends. The login is kept in a temporary folder and deleted right after.
   - saves a copy of the database inside the data volume (`/data/backups`, the newest 10 are kept),
   - restarts the service with the new image and waits for its health check,
   - switches back to the last healthy version by itself if the new one does not become healthy.
4. **Public check**: wait until `https://DOMAIN/healthz` answers from the internet, and check that the OAuth metadata there belongs to this service.

Pull requests only run steps 1 and 2, and nothing is published. Deploys never run at the same time.

#### One-time setup

**Shortcut for Ubuntu servers:** [deploy/server/setup-server.sh](deploy/server/setup-server.sh) does steps 1 to 3 and prepares the secrets for step 5. Copy it to the server (for example paste it into `nano setup-server.sh`), run `sudo bash setup-server.sh` and answer its questions. It writes the two GitHub secrets to a file only root can read and prints what to do next. You still need step 4 (reverse proxy and DNS) and to add the secrets in GitHub. The steps below explain what it does.

**Sharing a server with MCP for iCloud.** Both services can run on the same machine (they do on `nebula.visin.ch`). They share the `deploy` user, but each has its own folder (`~/padi-mcp`), its own SSH key for GitHub and its own host name. With Traefik in Docker (as on `nebula.visin.ch`) neither service needs a port on the machine: Traefik reaches each one over a shared Docker network. Only a proxy installed on the machine itself (nginx, Caddy) needs a local port per service. `setup-server.sh` asks which case you have and writes the matching `compose.override.yml`.

**1. Prepare the server.** Install Docker Engine with the Compose plugin ([instructions](https://docs.docker.com/engine/install/)). Then create a user that is only used for deploys (works on Ubuntu and Oracle Linux; skip this if the user exists already):

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
```

Members of the `docker` group control Docker, so they are as powerful as root on that machine. Keep this user for deploys only.

**2. Create an SSH key for GitHub** on your computer (without a passphrase):

```bash
ssh-keygen -t ed25519 -N "" -C "github-deploy padi-mcp" -f padi-mcp-deploy
cat padi-mcp-deploy.pub
```

On the server, add that public key for the deploy user, with the word `restrict` in front of it (it turns off port forwarding and terminals for this key; the deploy does not need them). Paste your own key in place of `ssh-ed25519 AAAA...`:

```bash
sudo -u deploy sh -c 'mkdir -p -m 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
echo 'restrict ssh-ed25519 AAAA... github-deploy padi-mcp' | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
```

**3. Create the settings file on the server** (with `nano`, `vi` or any editor):

```bash
sudo -u deploy mkdir -p /home/deploy/padi-mcp
sudo -u deploy nano /home/deploy/padi-mcp/.env
```

Start with this, using your own values:

```bash
DOMAIN=padi.mcp.visin.ch
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD='a long password'
```

Set both `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the service is online as soon as the first deploy finishes, and without them the first person who signs up becomes the administrator. Put values that contain a `$` in single quotes. All other options (`MASTER_KEY`, `TRUST_PROXY`, `SMTP_URL`, ...) are explained in [deploy/server/.env.example](deploy/server/.env.example); each deploy copies that file next to `.env` and only changes the `PADI_MCP_IMAGE` line of `.env`. `DOMAIN` needs a DNS record pointing to the server, and Claude needs `https://DOMAIN` on port 443 with a valid certificate.

**4. Point your reverse proxy at the service.** Give it its own host name (for example `padi.mcp.visin.ch`, a DNS record for the same server). `compose.yml` publishes no port on the server: how the proxy reaches the service goes in a `compose.override.yml` next to `compose.yml` on the server. Docker Compose loads it by itself, and the pipeline never touches it. `setup-server.sh` writes it for you; these are the cases:

- **A proxy that runs in Docker** (Traefik, Nginx Proxy Manager, ...): no port is needed. Put both on the same Docker network and forward to `http://padi-mcp:3000` (inside the Docker network the port is always 3000):

  ```yaml
  services:
    padi-mcp:
      networks: [default, proxy]
  networks:
    proxy:
      external: true
      name: your-proxy-network
  ```

  **Traefik** with the Docker provider also needs labels. Use the entrypoint and certificate resolver names of your Traefik (`docker inspect` another routed container to see them):

  ```yaml
  services:
    padi-mcp:
      networks: [default, proxy]
      labels:
        - traefik.enable=true
        - traefik.docker.network=your-proxy-network
        - traefik.http.routers.padi-mcp.rule=Host(`padi.mcp.visin.ch`)
        - traefik.http.routers.padi-mcp.entrypoints=websecure
        - traefik.http.routers.padi-mcp.tls.certresolver=myresolver
        - traefik.http.services.padi-mcp.loadbalancer.server.port=3000
  networks:
    proxy:
      external: true
      name: your-proxy-network
  ```

  After creating or changing the file, run `docker compose up -d` in that folder as the deploy user.

- **A proxy installed on the server** (nginx, Caddy): publish a local port with this `compose.override.yml`, and set `HOST_PORT` in `.env` (3000 by default; each service on the machine needs its own):

  ```yaml
  services:
    padi-mcp:
      ports:
        - "${BIND_ADDRESS:-127.0.0.1}:${HOST_PORT:-3000}:3000"
  ```

  Then point the proxy at `127.0.0.1:HOST_PORT`: for nginx see [deploy/nginx.conf.example](deploy/nginx.conf.example); for Caddy:

  ```
  padi.mcp.visin.ch {
      reverse_proxy 127.0.0.1:3001
  }
  ```

- **No proxy on the server**: add `COMPOSE_PROFILES=caddy` to `.env`. The bundled Caddy then answers on ports 80 and 443 and gets a Let's Encrypt certificate by itself. Only one service on a machine can do this: if MCP for iCloud uses its bundled Caddy already, use a shared proxy instead.

**5. Add the secrets in GitHub.**

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | The content of the private key file `padi-mcp-deploy`. |
| `DEPLOY_KNOWN_HOSTS` | The output of `ssh-keyscan -t ed25519 nebula.visin.ch`. |

Check the host key before you save it: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server must show the same fingerprint as `ssh-keyscan -t ed25519 nebula.visin.ch | ssh-keygen -lf -` on your computer. After saving the secrets you can delete the private key file from your computer.

Where to put them depends on your GitHub plan and on whether the repository is private:

- **GitHub Pro, Team or Enterprise (or a public repository)**: open *Settings > Environments > New environment* and name it `production`. Under *Deployment branches and tags* choose *Selected branches and tags* and add `main`. Add the two secrets as environment secrets there. Then only workflows running on `main` can use the key.
- **GitHub Free with a private repository**: environments are not available. Add the two secrets as repository secrets under *Settings > Secrets and variables > Actions*. The workflow reads them the same way, but any branch of this repository could then use the key, so only give write access to people you trust. (Pull requests from forks never get secrets.)

Approving each deploy by hand (*Required reviewers*) is only offered for public repositories and on GitHub Enterprise.

Optional variables (*Settings > Secrets and variables > Actions > Variables*):

| Variable | Default | Description |
| --- | --- | --- |
| `DEPLOY_HOST` | `nebula.visin.ch` | SSH host name of the server. |
| `DEPLOY_USER` | `deploy` | SSH user. |
| `DEPLOY_PORT` | `22` | SSH port. For another port, create `DEPLOY_KNOWN_HOSTS` with `ssh-keyscan -p PORT`. |
| `DEPLOY_PATH` | `padi-mcp` | Folder on the server, relative to the user's home folder or absolute. |

The server must accept SSH from GitHub's runners (their addresses change, so the port has to be reachable from the internet; on Oracle Cloud check the security list).

**6. Deploy from `main`.** Deploys only run from the `main` branch. If the repository has no `main` branch yet, create it from your working branch and make it the default branch, so *Run workflow* picks it by default:

```bash
git push origin <your-branch>:main
```

Then set *Settings > General > Default branch* to `main`. From now on every push or merge to `main` is deployed; follow it under *Actions > CI/CD*. You can also start a deploy by hand with *Actions > CI/CD > Run workflow* (choose `main` under *Use workflow from*). If the settings file on the server is missing, the first run copies the files there and stops with a message that says what to do.

When it is green, open `https://DOMAIN`, sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, connect your PADI account on the account page, and add `https://DOMAIN/mcp` to your AI app.

#### Day to day

Run the server commands as the deploy user, in its folder: `sudo -iu deploy`, then `cd padi-mcp`. Do not run `deploy.sh` as root; it stops with a message if you try.

- **Roll back**: *Actions > CI/CD > Run workflow*, choose `main` and `rollback`. Or on the server: `./deploy.sh rollback`. This goes back one version; a second rollback does nothing. To deploy an older version, open its run in the Actions list and re-run its *Deploy* job (GitHub allows this for 30 days), or revert the change on `main` and push.
- **See what runs**: `./deploy.sh status` shows the running image, the previous one and the last deploys. `docker compose logs -f` follows the logs. The full output of each deploy is in `.deploy/deploy.log`.
- **Change settings**: edit `.env`, then run `docker compose up -d` (or deploy again).
- **Back up**: deploys keep database copies inside the Docker volume, on the same disk. To keep a copy somewhere else, run `./deploy.sh backup`, then copy the backups and the encryption key out of the volume and off the server, for example:

  ```bash
  docker compose cp padi-mcp:/data/backups ./backups
  docker compose cp padi-mcp:/data/master.key ./backups/
  ```

  and download the `backups` folder (for example with `scp`). Keep it safe: it contains the encryption key. Skip `master.key` if you set `MASTER_KEY` in `.env` (then back up `.env`).

#### MCP Registry

The service is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.Mrc527/mcp-for-padi`, so AI apps and MCP directories can find it. The listing is [`server.json`](server.json): name, description, icons and the address `https://padi.mcp.visin.ch/mcp`.

To publish or update it: *Actions > MCP Registry > Run workflow* on the default branch (or push a tag `v<version>`). The workflow signs in to the registry with GitHub OIDC (no secret needed), takes the version from `package.json`, validates `server.json` and publishes it. Published versions cannot be changed, so bump `version` in `package.json` before publishing again; the run stops early if that version is already in the registry. The live entry: <https://registry.modelcontextprotocol.io/v0.1/servers/io.github.Mrc527%2Fmcp-for-padi/versions/latest>.

### Connect an AI app

The account page has a **Connect your AI app** section with one-click links and ready-to-copy commands. Every app uses the same address, `https://your-server/mcp`, and signs in with OAuth (the app opens your server, the user signs in and clicks **Allow**; no password or key goes into the app).

| App | How |
| --- | --- |
| Claude (web, desktop, mobile) | **Add to Claude** button (it fills in the name "MCP for PADI" and the address), or *Customize > Connectors > Add custom connector*. Keep the defaults ("Use Claude's published identity"). Team and Enterprise owners add it once under *Organization settings > Connectors*. |
| ChatGPT | On chatgpt.com: *Plugins > + > Add custom MCP server*, name "MCP for PADI", authentication *OAuth*. Availability depends on the plan and workspace settings. |
| Claude Code | `claude mcp add --transport http padi --scope user https://your-server/mcp`, then `claude mcp login padi` |
| Codex (CLI, IDE, ChatGPT desktop app) | `codex mcp add padi --url https://your-server/mcp` |
| VS Code (GitHub Copilot) | **Install in VS Code** button (`vscode:mcp/install` link), or `code --add-mcp '{"name":"padi","type":"http","url":"https://your-server/mcp"}'` |
| Visual Studio | **Install in Visual Studio** button (`vs-open.link/mcp-install`) |
| GitHub Copilot CLI | `copilot mcp add --transport http padi https://your-server/mcp` |
| Gemini, Le Chat, Perplexity | Steps on the account page (custom app / custom MCP connector, OAuth). |
| Cursor, Kiro, LM Studio, Goose | One-click install links on the account page. |
| Gemini CLI, Devin (Windsurf), Cline, Jan | `gemini mcp add --transport http --scope user padi ...`, `devin mcp add -s user padi ...`, `cline mcp add padi ... --transport http`, `jan cli mcp add padi --type http --url ...` |
| Zed, JetBrains, Warp, Raycast, Msty, Open WebUI, LibreChat, n8n | Settings snippets and steps on the account page. |
| Other apps | Add a remote (Streamable HTTP) MCP server with the address. Apps that only start local programs, or cannot sign in to remote servers (Roo Code, Continue), can use `npx -y mcp-remote https://your-server/mcp`. |

Users can see and revoke connected apps, and a log of recent tool calls, under **Connected apps**.

### Start page, languages and logo

- The **start page** (`/`) explains the service before sign-in: what it can do, example requests, how to connect, privacy and security, and an FAQ. Signed-in people go straight to their account.
- Every page is available in **English, Italian, German, French, Spanish and Simplified Chinese**. The language follows the browser (`Accept-Language`); the menu at the bottom of every page switches it and remembers the choice in a cookie (`?lang=de` works on any page). Texts live in `src/web/i18n/<language>/<area>.ts`; English is the source and the fallback. A test renders every page and fails if any visible text bypasses the catalogs. The product name, MCP for PADI (`common.appName`), is the same in every language.
- The **privacy policy** (`/privacy`) and the **terms of use** (`/terms`) are linked from the footer of every page, and `/.well-known/security.txt` says where to report security problems ([SECURITY.md](SECURITY.md)). They describe the hosted service, run by Marco Visin, Lugano, Switzerland. If you run your own copy, change the name, contact address and date in `src/web/operator.ts`, and the place in the legal texts (`src/web/i18n/<language>/legal.ts`).
- The **logo** is our own artwork (an open logbook with a wave and bubbles), not PADI's: `assets/brand/logo.svg`, and `logo-small.svg` for 16-32 px. `node scripts/make-icons.mjs` turns it into the favicon, the app icons, the icons the MCP server sends to AI apps (`src/web/brand-assets.ts`) and the 512 px directory icon (`docs/directory/icon-512.png`). It needs Playwright with Chromium; with a global install, run `NODE_PATH="$(npm root -g)" node scripts/make-icons.mjs`.
- There is no explainer video in this version. The start page leaves that section out.

### Admin page

`/admin` is available to administrators:

- **Overview** with the MCP address, user counts (also how many users have connected PADI), and a **Check public setup** button that fetches the discovery documents from the public URL the way Claude does.
- **Settings**: who can create an account (request access with approval, which is the default; invite only; anyone; nobody), allowed sign-up email domains, read-only for everyone, which AI apps may connect (for example only `claude.ai claude.com`), dynamic client registration and client metadata documents, token and session lifetimes, default time zone (for users who did not choose their own on the account page).
- **Access requests**: approve or reject people who asked for an account, one by one or all at once. The menu shows how many are waiting. If the operator set `SMTP_URL`, each administrator also gets an e-mail about new requests at their sign-in address. Requests that come close together arrive in one e-mail (the first about a minute after a request, then at most one every 10 minutes). Without `SMTP_URL`, no e-mail is sent and the admin page still lists the requests. Email addresses are not verified, so anyone can type any address: before you approve, check with the person in another way that the request is theirs. People are not notified automatically, so let them know when you approve them. Unanswered requests are deleted after 30 days, at most 100 can wait at the same time, and one IP address can send 5 requests a day.
- **Invites**: create single-use invite codes with an expiry. In approval mode a valid code skips the approval.
- **Demo account for app reviewers**: create a [demo account](#demo-account) with sample dives (the password is shown once), see the demo accounts and reset their data.
- **Users**: the column "PADI" shows whether each user has connected PADI, has not, or must sign in to PADI again. Make or remove administrators, disable or enable accounts (disabling also disconnects their apps), reset passwords, delete accounts, turn a user into a demo account and back. The last administrator cannot be removed.
- **OAuth clients**: see which AI apps registered and remove them.

Administrators never see PADI passwords (they are not stored) or the users' dives.

### Demo account

App reviewers (for example for the Claude Connectors Directory) should not need a real PADI account. A **demo account** has a PADI logbook simulated inside the server instead:

- **Create one** on the admin page under **Demo account for app reviewers**: type an email address for signing in (it is only the sign-in name; the server never sends mail to it) and copy the generated password, which is shown once. The account is approved and is never an administrator. You can also turn an existing user (not an administrator) into a demo account and back; their saved PADI connection is deleted when they become one.
- **Sample data:** the diver is "Alex Demo" (alex.demo@example.com) with an invented PADI affiliate id, in the time zone Europe/Zurich. The logbook has 25 invented dives over about three years: an Open Water course (training dives 1 to 4), two Advanced adventure dives, holidays on invented reefs, wrecks and walls, and local lake and quarry dives. Most dives are published, the training dives and a few others are verified by an invented PADI Pro, one dive waits for verification (Pending, so it is locked) and the newest one is a Draft. There are three invented eCards (Open Water, Advanced Open Water, Enriched Air), an invented dive site list and two invented PADI Pros for the instructor lookup. The demo dives have no photos. Dates are relative to the day of the reset, so the data always looks current. Every name, number and place is invented.
- **The same code as a real account:** `LogbookService` and every tool run unchanged. Only the PADI backend is replaced by an in-memory one (`src/demo/logbook.ts`).
- **Nothing leaves the server.** A demo account never opens a network connection: not to PADI, and not to the operator's `PADI_*_URL` overrides. Submitting a dive for verification works in the tools, but no PADI Pro gets a request.
- **RAM only, reset every day.** Every change is kept in memory only. All demo accounts go back to fresh sample data every day at 04:00 Swiss time (Europe/Zurich) and whenever the server restarts. **Reset demo data now** on the admin page does it at once.
- **The account page** shows a notice instead of the PADI form, and keeps the read-only switch, the connected apps, the activity log and the security page. The administrator's read-only setting for everyone applies to demo accounts too.

### Web service configuration

Environment variables for `--web`:

| Variable | Default | Description |
| --- | --- | --- |
| `PUBLIC_URL` | `http://localhost:PORT` | The public HTTPS address of the server, e.g. `https://padi-mcp.example.com`. The MCP endpoint is `PUBLIC_URL/mcp`. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens (`--port`, `--host`). The Docker image listens on `0.0.0.0`. |
| `DATA_DIR` | `./data` | Folder for the SQLite database (`padi-mcp.db`) and the generated encryption key. |
| `MASTER_KEY` | generated | 32-byte key (64 hex or 44 base64 characters) that encrypts the stored PADI refresh tokens. If unset, one is created in `DATA_DIR/master.key`. `MASTER_KEY_FILE` reads it from a file. Losing it means every user has to sign in to PADI again on the account page. |
| `TRUST_PROXY` | (off) | Set to `1` behind one reverse proxy so client IPs (rate limits) are read from `X-Forwarded-For`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Create this administrator account on first start (`ADMIN_PASSWORD_FILE` also works). |
| `SMTP_URL` | (none) | Optional SMTP server for e-mails to administrators about access requests, for example `smtps://user:password@mail.example.com:465` (`SMTP_URL_FILE` also works). Without it, no e-mail is sent. The server checks it at startup and does not start if it is not an `smtp://` or `smtps://` address with a host name. The connection must be encrypted: `smtps://` uses TLS from the start, and with `smtp://` the server must offer STARTTLS, otherwise nothing is sent, not even the password. For a mail server on the same machine without TLS, add `?requireTLS=false` to the URL. |
| `NOTIFY_FROM` | see text | Sender address of those e-mails: an address, or a name and an address (`MCP for PADI <noreply@example.com>`). Default: the SMTP user name when it is an e-mail address. If that user name is not an e-mail address, `NOTIFY_FROM` is required: the server does not start without it. Use an address your SMTP server may send from. The server does not start if `NOTIFY_FROM` is not an e-mail address. |
| `PADI_API_MODE` | `proxy` | Which PADI logbook endpoint every user's connection uses: `proxy`, `direct` or `auto`. See [How sign-in to PADI works](#how-sign-in-to-padi-works-and-what-is-stored). With the Docker Compose files in `deploy/`, set it in `.env`. |
| `PADI_COGNITO_URL`, `PADI_AUTH_URL`, `PADI_LOGBOOK_URL`, `PADI_DIRECT_URL`, `PADI_INSTRUCTOR_URL`, `PADI_DIRECT_INSTRUCTOR_URL`, `PADI_ECARD_URL`, `PADI_IMAGES_URL`, `PADI_CLIENT_ID`, `PADI_COGNITO_REGION` | PADI | Operator-only overrides that apply to every user, for tests against a local mock PADI API. Users can never change server addresses. |

Everything else is configured on the admin page.

### How sign-in to this server works (OAuth)

The server is its own OAuth 2.1 authorization server, built to the MCP authorization specification and Claude's connector requirements:

- Discovery: unauthenticated MCP requests get `401` with `WWW-Authenticate: Bearer ... resource_metadata="..."`; protected resource metadata is served at `/.well-known/oauth-protected-resource` (and `/mcp`), authorization server metadata at `/.well-known/oauth-authorization-server`.
- Clients identify themselves with a **Client ID Metadata Document** (Claude's published identity) or **dynamic client registration**. Documents are fetched with SSRF protection, and built-in copies of Claude's and ChatGPT's documents are used if claude.ai or chatgpt.com cannot be reached.
- Authorization code flow with **PKCE (S256)**, a consent page that judges an app by where it returns to, never by the name it gives itself (well-known AI apps such as Claude and ChatGPT are shown as recognized by their exact redirect address; answers to localhost, an app's own scheme or VS Code stay on the user's device; any other address gets a warning, and Allow only works after the user ticks a box to confirm they trust it), single-use codes, tokens bound to the MCP URL (RFC 8707), **rotating refresh tokens** with reuse detection, revocation. The consent page says what the app can do with the logbook: read dives and, unless the account is read-only, add, change and delete dives and send dives to a PADI Pro.
- Tokens, sessions and invite codes are stored only as SHA-256 hashes; PADI refresh tokens are encrypted with AES-256-GCM.
- Rate limits are applied per OAuth client and per user (Claude's requests for all users come from the same few IP ranges).

## How sign-in to PADI works and what is stored

PADI has no public API, and no way for other apps to ask for access. This server signs in the same way the PADI web app does, as your own PADI account, and only ever reads and changes your own logbook. The details are in [docs/padi-api.md](docs/padi-api.md).

**Sign-in.** Your PADI e-mail (lowercased) and password are sent once to PADI's sign-in service:

- `cognito` (the first choice): AWS Cognito (`cognito-idp.us-west-2.amazonaws.com`), the user directory behind PADI accounts, with the public app client of the PADI website.
- `padi`: PADI's own sign-in API (`api.global-prod.padi.com/auth/api`), the one the account.padi.com sign-in page uses.
- `auto` (default): `cognito` first. Only if Cognito fails for another reason than a wrong e-mail or password, try `padi`.

After a wrong e-mail or password the server never tries again by itself, so your PADI account is not locked. If PADI asks for anything else (a new password, a code, a confirmed e-mail), the server stops and tells you what to do on padi.com.

**Tokens.** A successful sign-in gives three tokens. The **ID token** is sent with every logbook request and is valid for one hour. The server renews it with the **refresh token** two minutes before it expires, and once more when PADI answers "not signed in". PADI decides how long the refresh token stays valid; it ends, for example, when you change your PADI password. Then the server asks you to sign in again. Your PADI affiliate id (the key of your logbook) is always read from your own token, never from what the AI app sends.

**Logbook API** (`PADI_API_MODE`):

- `proxy` (default): `logbook.global-prod.padi.com/api/Logbook`, the logbook endpoint the PADI web app used for years.
- `direct`: `divelog.global-prod.padi.com/v1/graphql`, the endpoint the current PADI web app uses.
- `auto`: start with `proxy`; if it keeps failing (not found or server errors twice in a row, or "not signed in" right after a fresh sign-in), switch to `direct` until the server restarts.

Other PADI hosts: `ecard.global-prod.padi.com` (eCards), `logbook-images-api.padi.com` (dive photos), and the instructor lookup on the logbook host (`dive-log-service.global-prod.padi.com` in `direct` mode). The PADI client talks to no other hosts. Writes are sent one after the other per user, failed requests are retried at most 3 times with a pause (on 429 and 5xx answers), and every request times out after 20 seconds.

**What is stored.**

| | Web service | Local mode |
| --- | --- | --- |
| PADI password | Never. Used once to sign in, then forgotten. | Only where you put it (environment variable or file). |
| PADI refresh token | Encrypted with AES-256-GCM (key in `MASTER_KEY` or `DATA_DIR/master.key`), tied to your account. A renewed refresh token replaces the old one. | In memory, or in the file `PADI_TOKEN_CACHE` (mode 0600) if you set it. |
| Other PADI details | Your PADI e-mail, name, affiliate id, login method, units, read-only setting and time zone, and when you connected (all encrypted with the token). | Nothing. |
| Dives, notes, photos, eCards | Never stored. They pass between PADI and your AI app while a request runs. | Never stored. |
| Activity | A log of tool calls (time, app, tool, duration, success; no content), kept 90 days. | Nothing. |

**Locked dives.** Dives that wait for a PADI Pro (`Pending`) or are verified (`Verified`, `QR Code Verified`) are locked: the tools refuse to change or delete them, the same way the PADI web app does.

## Local mode (single user)

1. **Check your PADI sign-in.** You need the e-mail and password you use on [learning.padi.com](https://learning.padi.com). If you sign in to PADI with Google, Apple or Facebook, first set a PADI password: use "Forgot password" on [account.padi.com](https://account.padi.com) with the same e-mail.
2. **Build the server** (Node.js 22.13 or newer):

   ```bash
   git clone https://github.com/Mrc527/PADI-MCP.git
   cd PADI-MCP
   npm install
   npm run build
   ```

3. **Test the connection:**

   ```bash
   PADI_EMAIL=you@example.com \
   PADI_PASSWORD='your PADI password' \
   node dist/index.js --check
   ```

   It signs in to PADI, counts your dives and prints the result (never a token). It exits with code 0 when everything works.

4. **Add it to your AI client** (see [Client setup](#client-setup-local-mode)).

To avoid a password in your client settings, set `PADI_TOKEN_CACHE` to a file once: the first start signs in with the password and writes the refresh token there (mode 0600). Later starts use the file and need no password until PADI ends the sign-in. You can also give a refresh token directly with `PADI_REFRESH_TOKEN`.

## Client setup (local mode)

Replace the path and the values with your own. Keep your PADI password out of files you share.

### Claude Desktop

Edit `claude_desktop_config.json` (*Settings > Developer > Edit Config*):

```json
{
  "mcpServers": {
    "padi": {
      "command": "node",
      "args": ["/absolute/path/to/PADI-MCP/dist/index.js"],
      "env": {
        "PADI_EMAIL": "you@example.com",
        "PADI_PASSWORD": "your PADI password",
        "PADI_TOKEN_CACHE": "/absolute/path/to/padi-token.json",
        "PADI_TIMEZONE": "Europe/Zurich"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add padi \
  -e PADI_EMAIL=you@example.com \
  -e "PADI_PASSWORD=your PADI password" \
  -e PADI_TOKEN_CACHE=$HOME/.config/padi-mcp/token.json \
  -- node /absolute/path/to/PADI-MCP/dist/index.js
```

### Cursor

Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "padi": {
      "command": "node",
      "args": ["/absolute/path/to/PADI-MCP/dist/index.js"],
      "env": { "PADI_EMAIL": "you@example.com", "PADI_PASSWORD": "your PADI password" }
    }
  }
}
```

### VS Code

Add this to `.vscode/mcp.json` (or run *MCP: Add Server* and choose *Command (stdio)*). The top-level key is `servers`, and VS Code can ask for the password instead of storing it:

```json
{
  "inputs": [{ "type": "promptString", "id": "padi-password", "description": "PADI password", "password": true }],
  "servers": {
    "padi": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/PADI-MCP/dist/index.js"],
      "env": { "PADI_EMAIL": "you@example.com", "PADI_PASSWORD": "${input:padi-password}" }
    }
  }
}
```

Windsurf and other stdio clients use the same `command`, `args` and `env` as the Claude Desktop example.

### Without cloning (npx from GitHub)

```json
{
  "command": "npx",
  "args": ["-y", "github:Mrc527/PADI-MCP"],
  "env": { "PADI_EMAIL": "you@example.com", "PADI_PASSWORD": "your PADI password" }
}
```

### Single-user HTTP mode

For a personal remote setup without accounts (clients that accept a static bearer token), start the server in HTTP mode. For Claude on the web and other hosted AI apps, use the [web service](#web-service-for-ai-apps-multi-user) instead.

```bash
MCP_HTTP_TOKEN="$(openssl rand -hex 32)" node dist/index.js --http --port 3000
```

The endpoint is `http://127.0.0.1:3000/mcp` (Streamable HTTP, stateless) and clients must send `Authorization: Bearer <token>`. By default the server only listens on `127.0.0.1`. To expose it, put it behind an HTTPS reverse proxy and set `MCP_HTTP_HOST=0.0.0.0` and `MCP_HTTP_ALLOWED_HOSTS=mcp.example.com`; the server refuses to listen on a public interface without `MCP_HTTP_TOKEN`. `GET /healthz` answers `{"status":"ok"}`.

## Configuration reference (local mode)

All settings are environment variables. You need `PADI_EMAIL` with `PADI_PASSWORD`, or a refresh token. (In web mode users set the equivalent options on their account page.)

| Variable | Default | Description |
| --- | --- | --- |
| `PADI_EMAIL` | | The e-mail you sign in to PADI with. |
| `PADI_PASSWORD` | | Your PADI password. `PADI_PASSWORD_FILE` reads it from a file. Optional when a refresh token or a token cache is there. |
| `PADI_REFRESH_TOKEN` | | Instead of the password: a PADI refresh token. `PADI_REFRESH_TOKEN_FILE` reads it from a file. |
| `PADI_TOKEN_CACHE` | (none) | File where the current refresh token is kept between runs (mode 0600). Unset: memory only. The cache wins over `PADI_REFRESH_TOKEN`, unless it was written for another e-mail. |
| `PADI_UNITS` | `auto` | Units of answers and inputs: `auto` (your PADI logbook setting), `metric` or `imperial`. PADI always stores metric values. |
| `PADI_READ_ONLY` | `false` | `true` removes every tool that adds, changes or deletes anything. |
| `PADI_TIMEZONE` | system zone | IANA time zone of the server's "today", for example `Europe/Zurich`. `padi_account_info` and the **Year in review** prompt use it, and a dive date may be at most 100 years before it. It does not decide what is "in the future": a dive date is only refused when it is after today everywhere on Earth, so a dive of today is never refused. |
| `PADI_LOGIN_METHOD` | `auto` | `auto`, `cognito` or `padi`. See [How sign-in to PADI works](#how-sign-in-to-padi-works-and-what-is-stored). |
| `PADI_API_MODE` | `proxy` | `proxy`, `direct` or `auto`: which PADI logbook endpoint to use. |
| `PADI_COGNITO_URL`, `PADI_AUTH_URL`, `PADI_LOGBOOK_URL`, `PADI_DIRECT_URL`, `PADI_INSTRUCTOR_URL`, `PADI_DIRECT_INSTRUCTOR_URL`, `PADI_ECARD_URL`, `PADI_IMAGES_URL`, `PADI_CLIENT_ID`, `PADI_COGNITO_REGION` | PADI | Other PADI hosts and client, for tests against a local mock only. |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` (same as `--http`). |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | `127.0.0.1` / `3000` | HTTP listen address (`--host`, `--port`). |
| `MCP_HTTP_TOKEN` | | Bearer token required on every HTTP request. `MCP_HTTP_TOKEN_FILE` reads it from a file. |
| `MCP_HTTP_ALLOWED_HOSTS` | | Extra accepted `Host` header values (DNS rebinding protection). |
| `MCP_HTTP_ALLOWED_ORIGINS` | | Browser origins allowed to call the server (CORS). |

See [.env.example](.env.example) for a template. The server does not read a `.env` file by itself: set the values in your MCP client configuration (the `env` block) or in your shell. To keep them in a file, start the server with Node's `--env-file` option, for example `node --env-file=.env dist/index.js --check`. In an MCP client configuration, put `"--env-file=/absolute/path/to/.env"` before the path to `dist/index.js` in `args`.

## Tools

The AI sees these tools (write tools are hidden in read-only mode). Every tool has a description that lists the accepted values and units, strictly typed parameters (unknown parameter names are rejected), and is marked as read-only, changing, destructive or reaching other people, so clients such as Claude can ask for confirmation first.

| Tool | Kind | What it does |
| --- | --- | --- |
| `padi_account_info` | read | Name, e-mail, PADI affiliate id, units, read-only, API mode, demo flag, server version and today's date. `check=true` also tests the connection and counts the dives. |
| `logbook_list_dives` | read | Dives, newest first: `limit` 1-100 (15), `offset`, `log_type`, `status`, `sort` (date, max_depth, bottom_time), `from`, `to`, `query` (text in title, location or buddies), `units`. Sorted by depth or time, the largest come first and dives without a value last. Returns the total and the next offset. |
| `logbook_get_dive` | read | Every detail of one dive, in the units you want, plus a link to edit it on learning.padi.com. |
| `logbook_stats` | read | Number of dives, total bottom time, deepest, longest, average depth and time, first and last dive; `from`, `to`, `group_by` (none, year, month, location, dive_type, log_type). |
| `logbook_search_dive_sites` | read | Search PADI's dive site list (`query`, `limit` 1-50). A free-text location is also allowed when logging. |
| `logbook_export_dives` | read | All dives (or `from`/`to`) as CSV or JSON, oldest first, in parts: `limit` (default 50 for JSON, 100 for CSV, at most 500) and `offset`. Returns the total and the next offset. |
| `logbook_lookup_instructor` | read | The name of a PADI Pro, by member number. |
| `padi_list_certifications` | read | Your eCards: title, date, PADI number, instructor, dive center, card image link. |
| `logbook_get_photos` | read | Up to 5 photos of a dive, as images (size-capped). Only JPEG, PNG, GIF and WebP can be shown: other photos (for example HEIC) are counted as skipped, with a link to the dive on learning.padi.com. |
| `logbook_create_dive` | write | Log a dive: title, date (not in the future), location, dive type, depth and bottom time (not needed for a Draft), and optional conditions, equipment, gas, feeling, notes, buddies and dive center. Training dives (`training: {course, log_number, ...}`) are saved as Draft. Returns the saved dive. |
| `logbook_update_dive` | write | Change any field of a dive; `null` clears a field. Refuses locked dives. Returns the updated dive. |
| `logbook_set_units` | write | Set the units of the PADI logbook (metric or imperial). No dive changes: PADI stores metric values. |
| `logbook_submit_for_verification` | write, reaches another person | Look up the PADI Pro, then send the dive to them for verification (it becomes Pending and locked). Needs `confirm: true`. A real PADI Pro gets a real request. |
| `logbook_delete_dive` | destructive | Delete a dive for good (PADI has no trash). `confirm_title` must be the dive's title. Refuses locked dives, and dives with photos (delete those on learning.padi.com, which also deletes the photos). Returns the deleted dive, so it can be logged again (as a new dive with a new id; photos are not part of it). |

Prompts: **Log a dive** (`log_a_dive`, asks only for what is missing, then logs the dive; hidden in read-only mode) and **Year in review** (`year_in_review`, a summary of a year of diving).

Notes:

- **Units.** PADI stores metric values (m, minutes, °C, bar, kg, litres). With units `auto` the server answers in the units of your PADI logbook setting, and every dive it returns says which units it uses. Tools that take depths, temperatures or other measured values have a `units` parameter, so the AI can pass values in the units you used.
- **Dates** are calendar dates (`YYYY-MM-DD`) without a time zone.
- **Values.** Dive type is `Boat`, `BeachShore` or `Other` (the server also accepts words like "shore" or "beach"). The tool descriptions list every accepted value for weather, visibility, waves, current, surge, suit, weight, cylinder, gas and feeling.
- **Status.** New dives are `Publish` (logged) or `Draft`. `Pending`, `Verified` and `QR Code Verified` dives are locked.
- **Safety.** Dive titles, notes, buddies and other logbook text are user data: the server tells the AI to never follow instructions found inside them, and to ask before deleting a dive or sending one to a PADI Pro.

## Security

**Web service:**

- The PADI password is used once to sign in and is never stored. The PADI refresh token is encrypted at rest (AES-256-GCM, key in `MASTER_KEY` or `DATA_DIR/master.key`) and never shown, not even to administrators. Whoever runs the server and holds the database and the key can decrypt the refresh tokens, so users must trust the operator. Changing your PADI password ends every refresh token, also the one on this server; **Remove** on the account page deletes it at once.
- Web sessions use host-only `HttpOnly`, `SameSite=Lax` cookies (`__Host-` prefixed on HTTPS), every form has a CSRF token, passwords are hashed with scrypt, sign-in is rate limited, and pages send a strict Content Security Policy that forbids framing.
- Users cannot change server addresses (no requests to internal hosts), cannot read or write local files, and each request only ever sees the logbook of the token's owner.
- New accounts need an administrator's approval by default. Keep it that way (or use invite codes) if the server is public: open sign-up lets anyone use your server and its connection to PADI.

**Both modes:**

- Passwords and tokens are never included in tool results or logs. Error messages and logs mask anything that looks like a token (JWTs, `Bearer` values), and logs never contain e-mail addresses.
- The PADI affiliate id always comes from the signed-in user's token, never from the AI app.
- **Read-only mode** (`PADI_READ_ONLY=true`, or the switch on the account page) removes every tool that can add, change or delete.
- Deleting a dive needs its title as confirmation, sending a dive to a PADI Pro needs `confirm: true`, and locked dives cannot be changed or deleted. Still, review what your AI client does (most clients ask for approval per tool call).
- The token cache file (`PADI_TOKEN_CACHE`) is written with mode 0600. Treat it like a password.
- The HTTP mode listens on `127.0.0.1` by default, checks the `Host` and `Origin` headers, compares the bearer token in constant time and refuses public interfaces without a token. Always put it behind HTTPS when exposing it.

How to report a security problem: [SECURITY.md](SECURITY.md).

## Troubleshooting

Run `node dist/index.js --check` first (local mode), or **Save and test** on the account page (web service): both sign in to PADI and print a clear error.

| Problem | Fix |
| --- | --- |
| "Wrong e-mail or password" | Use the e-mail and password you use on learning.padi.com. Sign in there once in a browser to be sure. The server does not try again by itself, so your account is not locked; wait a moment before you retry. |
| You sign in to PADI with Google, Apple or Facebook | Those sign-ins only work in a browser. Set a PADI password first: "Forgot password" on account.padi.com with the same e-mail, then use that password here. Your Google, Apple or Facebook sign-in keeps working. |
| "Your PADI sign-in expired" | PADI ended the sign-in, for example after a password change, or the refresh token got too old. Web service: sign in to PADI again on the account page (**Reconnect**). Local mode: delete the `PADI_TOKEN_CACHE` file or the old `PADI_REFRESH_TOKEN` and start again with `PADI_PASSWORD`. |
| PADI asks for a new password, a code or a confirmed e-mail | Sign in once at learning.padi.com in a browser and do what PADI asks, then try again. |
| Errors after PADI changed its website or API (for example "not found", server errors, or "not signed in" right after a fresh sign-in) | Try `PADI_API_MODE=auto` or `PADI_API_MODE=direct`. For the web service this is an operator setting for every user: with Docker Compose, put it in `.env` next to the compose file, then run `docker compose up -d`. If both fail, PADI changed its private API: check for a newer version of this project, or open an issue. In local mode, `PADI_LOGIN_METHOD=padi` can help when the Cognito sign-in stops working. The web service always signs in with `auto`, which already tries PADI's own sign-in API when Cognito fails for another reason than a wrong e-mail or password. |
| A dive "is locked" and cannot be changed or deleted | The dive waits for a PADI Pro (Pending) or is verified. PADI does not let you change it, and neither does this server. |
| The AI app uses the wrong date for "today" or "yesterday" | Web service: choose your time zone on the account page. Local mode: set `PADI_TIMEZONE` to your time zone. A dive of today is never refused as "in the future", whatever the time zone. |
| Depths or temperatures look wrong | Ask for the units you want, or set `PADI_UNITS` (or the units on the account page). PADI stores metric values; `auto` follows the PADI logbook setting. |
| Claude cannot connect to the web service | Check `https://DOMAIN/healthz` from outside, the reverse proxy (keep the `Host` and `WWW-Authenticate` headers) and Cloudflare bot protection. **Check public setup** on the admin page shows what Claude sees. |

## Development

```bash
npm install
npm run build          # compile to dist/
npm run dev            # run from source with tsx
npm run typecheck
npm test               # unit tests (integration tests are skipped)
```

The unit tests use a mocked `fetch` for the PADI client (sign-in success, failure and challenges, refresh, single-flight refresh, retry on 401 and `invalid-jwt`, the `auto` API mode switch, query text and headers in proxy and direct mode), and cover the logbook service (array literals, dates, units, merge on update, missing child rows, locked dives, delete confirmation), the MCP tool surface (tool list, annotations, read-only mode, strict arguments, redaction), the demo logbook, and the web service (sign-up, sign-in, CSRF, account settings, the full OAuth flow with the SDK's OAuth client as Claude would run it, token refresh and reuse detection, client metadata documents, admin controls, security headers, translations).

End-to-end tests start the real server (in process, and the built `dist/index.js` over stdio, `--http` and `--web`) against an in-process mock of the PADI API (`test/helpers/mock-padi.ts`: Cognito, the PADI auth API, the logbook GraphQL API and the REST endpoints). They never talk to PADI and need no PADI account:

```bash
npm run build
PADI_MCP_IT=1 npm run test:integration
```

Test data is always invented: never put real names, PADI numbers or e-mail addresses from real accounts into code, tests or docs.

Project layout:

```
src/
  index.ts            CLI entry point (stdio / --web / --http / --check)
  config.ts           environment configuration
  server.ts           MCP server, instructions, prompts, service wiring
  http.ts             Streamable HTTP transport with auth and Host/Origin checks
  tooling.ts          tool registration helpers (errors, read-only gating, annotations, redaction)
  padi/               PADI client: endpoints, sign-in, token session, HTTP, GraphQL, API
  logbook/            the contract (types.ts), enums, units, mapping, LogbookService, MCP tools
  demo/               the in-memory demo logbook and its invented sample dives
  util/               dates, text helpers, errors
  web/                multi-user web service: SQLite store, encryption, OAuth provider,
                      start, account and admin pages, per-user MCP endpoint and connection pool
  web/i18n/           page texts per language (en is the source)
assets/brand/         the logo (SVG); scripts/make-icons.mjs makes the icons from it
deploy/               Docker Compose with Caddy, nginx example
deploy/server/        production stack and deploy script used by the CI/CD pipeline
docs/                 design notes, the PADI API notes, Connectors Directory texts
scripts/              build helper, Docker image smoke test, icon generator
.github/              CI/CD and MCP Registry workflows, SSH deploy script
```

## License

MIT. MCP for PADI is not made by, affiliated with, or endorsed by PADI. PADI is a registered trademark of PADI Worldwide Corp.
