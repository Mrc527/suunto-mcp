# MCP for Suunto

**MCP for Suunto** is an [MCP](https://modelcontextprotocol.io) server that lets **any AI app** (Claude, ChatGPT, Codex, VS Code, Cursor and others) read your **Suunto** data: workouts, daily steps and energy, 24/7 heart rate, sleep, recovery, routes and points of interest. It can also add routes and points of interest to your Suunto App, and from there they can sync to your watch. Ask in your own words: "How far did I run this month?", "How did I sleep this week?", "Compare my last two trail runs", "Add this GPX route to my Suunto App".

You can use the hosted service at [suunto.mcp.visin.ch](https://suunto.mcp.visin.ch) (MCP address `https://suunto.mcp.visin.ch/mcp`) or run your own copy. The command, the npm package and the Docker image are called `suunto-mcp`.

> **Independent project.** MCP for Suunto is an independent open-source project by Marco Visin. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto. Suunto is a registered trademark of Suunto Oy. The logo is our own artwork, not Suunto's.
>
> You connect your Suunto account on Suunto's own sign-in page (OAuth 2.0). This server never sees your Suunto password.
>
> **Not medical advice.** Heart rate, sleep and recovery values come from your watch. They are not medical advice, and the AI app can make mistakes when it reads them. Routes and points of interest are not for navigation or safety decisions.

This repository replaces an older prototype of the same name (a Next.js app on Vercel at `suunto-mcp.vercel.app`). Nothing of it is kept, and that Vercel deployment can be removed (see [Deploy from main](#deploy-with-github-actions-cicd), step 6).

There are two ways to run it:

| | Web service (multi-user) | Local (single user) |
| --- | --- | --- |
| For | AI apps that connect to remote MCP servers (Claude, ChatGPT, Codex, VS Code, ...), shared by many people | Claude Desktop, Claude Code, Cursor, VS Code and other local MCP clients |
| Start with | `suunto-mcp --web` (or Docker) | `suunto-mcp` (stdio) |
| Suunto app keys | The operator's, from the Suunto API Zone, in the server environment | Your own, from your own app in the Suunto API Zone |
| Sign-in to Suunto | Each user clicks **Connect Suunto** on the account page and allows access on Suunto's page; only encrypted tokens are kept | `suunto-mcp --login` once, then a token file |
| AI app sign-in | OAuth: each user creates an account and connects their AI app | None (stdio), or a bearer token (`--http`) |
| Settings | Web pages for users, plus an admin page | Environment variables |

What the AI can do:

| Area | What the AI can do |
| --- | --- |
| Workouts | List workouts by date and sport, read every detail of a workout (laps, heart rate zones, training effect, weather, dive and swim data when the watch recorded them), and its sample streams (heart rate, altitude, speed, pace, cadence, power, temperature, depth, distance, GPS track) |
| Statistics | Number of workouts, total time, distance, ascent, energy, average heart rate, longest and farthest workout, per week, month, year or sport |
| Files | Export a workout as a FIT file |
| Daily activity | Steps and energy per day, and 24/7 samples: heart rate, steps, energy, SpO2, HRV and altitude, per hour or per day |
| Sleep and recovery | Each night's sleep (deep, light and REM sleep, heart rate, HRV, SpO2, quality), naps, and recovery balance and stress state |
| Routes and places | List your routes, read a route or its GPX file, list your points of interest; add a GPX route or a point of interest to the Suunto App (they can sync to the watch) |

## Contents

- [Web service for AI apps (multi-user)](#web-service-for-ai-apps-multi-user)
  - [Deploy](#deploy)
  - [Suunto API Zone setup](#suunto-api-zone-setup)
  - [Deploy with GitHub Actions (CI/CD)](#deploy-with-github-actions-cicd)
  - [Connect an AI app](#connect-an-ai-app)
  - [Start page, languages and logo](#start-page-languages-and-logo)
  - [Admin page](#admin-page)
  - [Demo account](#demo-account)
  - [Web service configuration](#web-service-configuration)
  - [How sign-in to this server works (OAuth)](#how-sign-in-to-this-server-works-oauth)
- [How the Suunto connection works and what is stored](#how-the-suunto-connection-works-and-what-is-stored)
- [Local mode (single user)](#local-mode-single-user)
- [Client setup (local mode)](#client-setup-local-mode)
- [Configuration reference (local mode)](#configuration-reference-local-mode)
- [Tools](#tools)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Web service for AI apps (multi-user)

In web mode the server is a small website plus an MCP endpoint:

- People **create an account** on the website. On the account page they click **Connect Suunto**. Suunto's own sign-in page opens: they sign in with their Suunto App account there and allow access. Suunto sends them back to the server, which keeps only the Suunto tokens, encrypted. The Suunto password never reaches the server. They also choose the units (metric or imperial) and their time zone (it decides what "today" and "this week" are), and can turn on read-only mode.
- Once connected, the account page shows the Suunto username, when the connection was made and the number of workouts Suunto had for the 30 days before that (counted once, when the connection was made; "100+" means more than 100), or why that test request failed. (Showing the page never calls Suunto, to save the API's call limit.) Units, time zone and read-only can be changed there at any time. **Reconnect** runs the Suunto sign-in again, and **Remove** ends the connection at Suunto and deletes the stored tokens. If Suunto ends the connection, the page and the AI app both say so, and the user connects again with **Connect Suunto again**.
- They add **one URL** (`https://your-server/mcp`) to their AI app (in Claude a **custom connector**). The app opens a sign-in window, they sign in to your server and click **Allow**. From then on the app works with *their* Suunto data.
- An **admin page** controls who can sign up (request access with approval, invite codes, open, closed), read-only mode for everyone, which AI apps may connect, token lifetimes, users and connected apps, and shows whether the Suunto connection of the server is set up.

### Deploy

Claude connects from Anthropic's cloud, so the server must be reachable on the internet over **HTTPS on port 443** with a normal certificate and a public IPv4 address.

You also need the keys of an app in the **Suunto API Zone** (a client id, a client secret and a subscription key): see [Suunto API Zone setup](#suunto-api-zone-setup). Without them the service still starts and demo accounts work, but real accounts cannot connect Suunto. The account page then says that the administrator has not set up the Suunto connection yet.

**Docker Compose with automatic HTTPS (recommended).** Point a DNS name at your machine, open ports 80 and 443, then:

```bash
git clone https://github.com/Mrc527/suunto-mcp.git
cd suunto-mcp/deploy
cp .env.example .env        # set DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD and the three SUUNTO_ keys
docker compose up -d
```

[Caddy](https://caddyserver.com) obtains the certificate. Open `https://DOMAIN`, sign in with the admin account, and you are done. Data (the SQLite database and the encryption key) lives in the `data` volume: **back it up**.

**Without Docker** (Node.js 22.13 or newer):

```bash
npm install && npm run build
PUBLIC_URL=https://suunto-mcp.example.com TRUST_PROXY=1 DATA_DIR=/var/lib/suunto-mcp \
  SUUNTO_CLIENT_ID=... SUUNTO_CLIENT_SECRET_FILE=/etc/suunto-mcp/client-secret \
  SUUNTO_SUBSCRIPTION_KEY_FILE=/etc/suunto-mcp/subscription-key \
  node dist/index.js --web --port 3000
```

Put it behind an HTTPS reverse proxy (see [deploy/nginx.conf.example](deploy/nginx.conf.example)): forward everything to port 3000, keep the `Host` header, allow at least 300 seconds read timeout, allow request bodies of at least 8 MB (a route import sends a GPX file of up to 5 MB) and do not strip the `WWW-Authenticate` header. If you use Cloudflare, do not enable "Block AI bots" or "Bot Fight Mode" for this host: Claude's requests (User-Agent `Claude-User`, from `160.79.104.0/21` and `153.61.208.0/20`) would be blocked.

The server needs outbound HTTPS to:

- Suunto: `cloudapi-oauth.suunto.com` (sign-in and tokens) and `cloudapi.suunto.com` (data).
- The hosts of the AI apps' client metadata documents. When an app connects with a `client_id` URL, the server fetches that document, for example from `claude.ai` or `chatgpt.com`. If the fetch fails, built-in copies of Claude's and ChatGPT's documents are used; other apps that sign in this way cannot connect without it.
- Its own `PUBLIC_URL`, for **Check public setup** on the admin page.
- Your SMTP server, only if you want e-mails about access requests.

It needs no other outbound access. Suunto does not need to reach the server: this version uses no Suunto webhooks, only the browser redirect back to `/suunto/callback`.

If no administrator is configured (both `ADMIN_EMAIL` and `ADMIN_PASSWORD`), the first person who signs up becomes the administrator. After that, the server works by approval: other people can **request access** (with an optional message), and an administrator approves or rejects each request on the admin page. You can switch to invite codes only, open sign-up or closed sign-up there.

### Suunto API Zone setup

The server talks to Suunto through the official **Suunto Cloud API**. Suunto gives API access to companies and organizations in its partner program, not for personal use. The operator of a server (the hosted service, or you if you run your own copy) needs:

1. **Become a Suunto partner.** Create an account at [apizone.suunto.com](https://apizone.suunto.com) and apply for the Suunto partner program; Suunto accepts you and you sign its API agreement. One API Zone account has one app. A test server and a production server need separate accounts.
2. **Subscribe to the Developer API** (under *Products*). It has every endpoint of the production API, but a low limit: 10 calls per minute and 200 calls per week. The limit counts every call of your app, so all users of your server share it, and one question to the AI can take several calls (a year of workout statistics reads up to 20 pages, three months of sleep takes 4 calls of 28 days). Use it for testing.
3. **Set up the app** in your API Zone *Profile > OAuth settings*: the **App name** (users see it on Suunto's page and in the Suunto App), a **Client secret** that you choose, and the **Redirect URI** `https://<DOMAIN>/suunto/callback`. For the hosted service that is `https://suunto.mcp.visin.ch/suunto/callback`. Suunto then shows the generated **Client Id**.
4. **Copy the three keys**: the client id, the client secret and the **subscription key** of your API subscription (the primary or the secondary key, both work). Put them in the server environment as `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET` and `SUUNTO_SUBSCRIPTION_KEY`: in `.env` next to the compose file, or as GitHub secrets for the [CI/CD deploy](#deploy-with-github-actions-cicd). Set all three or none: with only some of them the server does not start. Then run `docker compose up -d` (or deploy again).
5. **Check it** on the admin page: the **Suunto API** card says whether the three keys are set (it never shows them) and which redirect URI to register. Then connect your own Suunto account on the account page.
6. **Go to production** when you are ready: subscribe to the **Production API** and fill in Suunto's content form (the app information in your API Zone profile), so that Suunto accepts the production subscription. Suunto then lists your app among the partner services in the Suunto App. Replace `SUUNTO_SUBSCRIPTION_KEY` with the key of the production subscription. The client id, the secret and the redirect URI stay the same.

Suunto asks partners not to poll its API. This server never polls: it only calls Suunto while a tool runs, for the user who asked, and once when a user connects Suunto (the test request), never just to show a web page. To save calls, it keeps recent answers of each real account in memory for a few minutes (see [Hosts, limits and the cache](#how-the-suunto-connection-works-and-what-is-stored)).

If you move the server to another host name, change the redirect URI in the API Zone too, or set `SUUNTO_REDIRECT_URI` to the URI that is registered (it must point to `/suunto/callback` on this server).

### Deploy with GitHub Actions (CI/CD)

The workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) tests every pull request and deploys every push to `main` to your own server over SSH. The default server is `nebula.visin.ch`, and the hosted service runs there as `suunto.mcp.visin.ch`, next to MCP for PADI and MCP for iCloud.

What happens on a push to `main`:

1. **Test**: type check, build, unit tests and integration tests on Node.js 22 and 24. The integration tests run against an in-process mock of the Suunto API, OAuth and data (`SUUNTO_MCP_IT=1`), so CI needs no Suunto account and no API keys, and never talks to Suunto.
2. **Image**: build the Docker image for `linux/amd64` and `linux/arm64` (so it runs on Intel/AMD and on ARM servers such as Oracle Cloud Ampere), start each one and check that it works (health check, sign-in page, OAuth discovery, MCP endpoint). Then publish it to `ghcr.io/mrc527/suunto-mcp` with the tags `sha-<commit>` and `latest`.
3. **Deploy**: connect to the server over SSH (the server's host key is pinned), copy [deploy/server](deploy/server) to it and run `deploy.sh`, which:
   - pulls the new image by its digest. It uses the job's own token, which can read this repository and its packages and expires when the job ends. The login is kept in a temporary folder and deleted right after.
   - writes the Suunto app keys to `.env`, if they are set as GitHub secrets (see step 5 below),
   - saves a copy of the database inside the data volume (`/data/backups`, the newest 10 are kept),
   - restarts the service with the new image and waits for its health check,
   - switches back to the last healthy version by itself if the new one does not become healthy.
4. **Public check**: wait until `https://DOMAIN/healthz` answers from the internet, and check that the OAuth metadata there belongs to this service.

Pull requests only run steps 1 and 2, and nothing is published. Deploys never run at the same time.

#### One-time setup

**Shortcut for Ubuntu servers:** [deploy/server/setup-server.sh](deploy/server/setup-server.sh) does steps 1 to 3 and prepares the secrets for step 5. Copy it to the server (for example paste it into `nano setup-server.sh`), run `sudo bash setup-server.sh` and answer its questions: the host names, how your reverse proxy reaches the service, the administrator account and the three Suunto app keys (the secret and the key are not shown while you paste them; press Enter to skip them for now). It writes the two GitHub secrets to a file only root can read and prints what to do next. You still need step 4 (DNS, and the reverse proxy unless you use Traefik) and to add the secrets in GitHub. The steps below explain what it does.

**Sharing a server with MCP for PADI and MCP for iCloud.** The services can run on the same machine (they do on `nebula.visin.ch`). They share the `deploy` user, but each has its own folder (`~/suunto-mcp`), its own SSH key for GitHub and its own host name. With Traefik in Docker (as on `nebula.visin.ch`) none of them needs a port on the machine: Traefik reaches each one over a shared Docker network, and `setup-server.sh` suggests the network, entrypoint and certificate resolver of a container Traefik already routes (for example MCP for PADI). Only a proxy installed on the machine itself (nginx, Caddy) needs a local port per service. `setup-server.sh` asks which case you have and writes the matching `compose.override.yml`.

**1. Prepare the server.** Install Docker Engine with the Compose plugin ([instructions](https://docs.docker.com/engine/install/)). Then create a user that is only used for deploys (works on Ubuntu and Oracle Linux; skip this if the user exists already, for example from MCP for PADI):

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
```

Members of the `docker` group control Docker, so they are as powerful as root on that machine. Keep this user for deploys only.

**2. Create an SSH key for GitHub** on your computer (without a passphrase):

```bash
ssh-keygen -t ed25519 -N "" -C "github-deploy suunto-mcp" -f suunto-mcp-deploy
cat suunto-mcp-deploy.pub
```

On the server, add that public key for the deploy user, with the word `restrict` in front of it (it turns off port forwarding and terminals for this key; the deploy does not need them). Paste your own key in place of `ssh-ed25519 AAAA...`:

```bash
sudo -u deploy sh -c 'mkdir -p -m 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
echo 'restrict ssh-ed25519 AAAA... github-deploy suunto-mcp' | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
```

**3. Create the settings file on the server** (with `nano`, `vi` or any editor):

```bash
sudo -u deploy mkdir -p /home/deploy/suunto-mcp
sudo -u deploy nano /home/deploy/suunto-mcp/.env
sudo chmod 600 /home/deploy/suunto-mcp/.env
```

Start with this, using your own values:

```bash
DOMAIN=suunto.mcp.visin.ch
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD='a long password'
SUUNTO_CLIENT_ID=
SUUNTO_CLIENT_SECRET=
SUUNTO_SUBSCRIPTION_KEY=
```

Fill in the three Suunto keys (in single quotes) when you have them, or leave all three empty: the
service then starts, but only demo accounts work until you add them here or as GitHub secrets
(step 5). Set all three or none: with only some of them the service does not start.

Set both `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the service is online as soon as the first deploy finishes, and without them the first person who signs up becomes the administrator. Put values that contain a `$` in single quotes. The Suunto keys can also come from GitHub secrets instead (step 5). All other options (`MASTER_KEY`, `TRUST_PROXY`, `SMTP_URL`, ...) are explained in [deploy/server/.env.example](deploy/server/.env.example); each deploy copies that file next to `.env` and only changes the `SUUNTO_MCP_IMAGE` line of `.env` (and the Suunto keys, when they are GitHub secrets). `DOMAIN` needs a DNS record pointing to the server, and Claude needs `https://DOMAIN` on port 443 with a valid certificate.

**4. Point your reverse proxy at the service.** Give it its own host name (for example `suunto.mcp.visin.ch`, a DNS record for the same server). `compose.yml` publishes no port on the server: how the proxy reaches the service goes in a `compose.override.yml` next to `compose.yml` on the server. Docker Compose loads it by itself, and the pipeline never touches it. `setup-server.sh` writes it for you; these are the cases:

- **A proxy that runs in Docker** (Traefik, Nginx Proxy Manager, ...): no port is needed. Put both on the same Docker network and forward to `http://suunto-mcp:3000` (inside the Docker network the port is always 3000):

  ```yaml
  services:
    suunto-mcp:
      networks: [default, proxy]
  networks:
    proxy:
      external: true
      name: your-proxy-network
  ```

  **Traefik** with the Docker provider also needs labels. Use the entrypoint and certificate resolver names of your Traefik (`docker inspect` another routed container, such as MCP for PADI, to see them):

  ```yaml
  services:
    suunto-mcp:
      networks: [default, proxy]
      labels:
        - traefik.enable=true
        - traefik.docker.network=your-proxy-network
        - traefik.http.routers.suunto-mcp.rule=Host(`suunto.mcp.visin.ch`)
        - traefik.http.routers.suunto-mcp.entrypoints=websecure
        - traefik.http.routers.suunto-mcp.tls.certresolver=myresolver
        - traefik.http.services.suunto-mcp.loadbalancer.server.port=3000
  networks:
    proxy:
      external: true
      name: your-proxy-network
  ```

  After creating or changing the file, run `docker compose up -d` in that folder as the deploy user.

- **A proxy installed on the server** (nginx, Caddy): publish a local port with this `compose.override.yml`, and set `HOST_PORT` in `.env` (3000 by default; each service on the machine needs its own):

  ```yaml
  services:
    suunto-mcp:
      ports:
        - "${BIND_ADDRESS:-127.0.0.1}:${HOST_PORT:-3000}:3000"
  ```

  Then point the proxy at `127.0.0.1:HOST_PORT`: for nginx see [deploy/nginx.conf.example](deploy/nginx.conf.example); for Caddy:

  ```
  suunto.mcp.visin.ch {
      reverse_proxy 127.0.0.1:3002
  }
  ```

- **No proxy on the server**: add `COMPOSE_PROFILES=caddy` to `.env`. The bundled Caddy then answers on ports 80 and 443 and gets a Let's Encrypt certificate by itself. Only one service on a machine can do this: if MCP for PADI or MCP for iCloud uses its bundled Caddy already, use a shared proxy instead.

**5. Add the secrets in GitHub.**

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | The content of the private key file `suunto-mcp-deploy`. |
| `DEPLOY_KNOWN_HOSTS` | The output of `ssh-keyscan -t ed25519 nebula.visin.ch`. |
| `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET`, `SUUNTO_SUBSCRIPTION_KEY` | Optional: the [Suunto app keys](#suunto-api-zone-setup). When all three are set, every deploy writes them to `.env` on the server (and they win over what is there). When none is set, the server keeps the keys in its `.env`. Setting only some of them stops the deploy with a message. The client id may also be a variable instead of a secret. |

Check the host key before you save it: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server must show the same fingerprint as `ssh-keyscan -t ed25519 nebula.visin.ch | ssh-keygen -lf -` on your computer. After saving the secrets you can delete the private key file from your computer. You can reuse the deploy key of MCP for PADI if it is already allowed for the `deploy` user, but a key per service is easier to replace.

Where to put them depends on your GitHub plan and on whether the repository is private:

- **GitHub Pro, Team or Enterprise, or a public repository (this one is public)**: open *Settings > Environments > New environment* and name it `production`. Under *Deployment branches and tags* choose *Selected branches and tags* and add `main`. Add the secrets as environment secrets there. Then only workflows running on `main` can use them.
- **GitHub Free with a private repository**: environments are not available. Add the secrets as repository secrets under *Settings > Secrets and variables > Actions*. The workflow reads them the same way, but any branch of this repository could then use the key, so only give write access to people you trust. (Pull requests from forks never get secrets.)

Approving each deploy by hand (*Required reviewers*) is only offered for public repositories and on GitHub Enterprise.

Optional variables (*Settings > Secrets and variables > Actions > Variables*):

| Variable | Default | Description |
| --- | --- | --- |
| `DEPLOY_HOST` | `nebula.visin.ch` | SSH host name of the server. |
| `DEPLOY_USER` | `deploy` | SSH user. |
| `DEPLOY_PORT` | `22` | SSH port. For another port, create `DEPLOY_KNOWN_HOSTS` with `ssh-keyscan -p PORT`. |
| `DEPLOY_PATH` | `suunto-mcp` | Folder on the server, relative to the user's home folder or absolute. |

The server must accept SSH from GitHub's runners (their addresses change, so the port has to be reachable from the internet; on Oracle Cloud check the security list).

**6. Deploy from `main`.** Deploys only run from the `main` branch, which is the default branch of this repository. Every push or merge to `main` is deployed; follow it under *Actions > CI/CD*. You can also start a deploy by hand with *Actions > CI/CD > Run workflow* (choose `main` under *Use workflow from*). If the settings file on the server is missing, the first run copies the files there and stops with a message that says what to do.

`main` used to hold the old Next.js prototype, which Vercel built and served at `suunto-mcp.vercel.app`. In the Vercel dashboard, disconnect the Git repository from that project or delete the project: otherwise Vercel tries to build every push to `main` and fails, and the old prototype stays online.

When it is green, open `https://DOMAIN`, sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, check the **Suunto API** card on the admin page, connect your Suunto account on the account page, and add `https://DOMAIN/mcp` to your AI app.

#### Day to day

Run the server commands as the deploy user, in its folder: `sudo -iu deploy`, then `cd suunto-mcp`. Do not run `deploy.sh` as root; it stops with a message if you try.

- **Roll back**: *Actions > CI/CD > Run workflow*, choose `main` and `rollback`. Or on the server: `./deploy.sh rollback`. This goes back one version; a second rollback does nothing. To deploy an older version, open its run in the Actions list and re-run its *Deploy* job (GitHub allows this for 30 days), or revert the change on `main` and push.
- **See what runs**: `./deploy.sh status` shows the running image, the previous one and the last deploys. `docker compose logs -f` follows the logs. The full output of each deploy is in `.deploy/deploy.log`.
- **Change settings**: edit `.env`, then run `docker compose up -d` (or deploy again). If the Suunto keys are GitHub secrets, change them there and deploy again: a deploy writes them over the values in `.env`.
- **Back up**: deploys keep database copies inside the Docker volume, on the same disk. To keep a copy somewhere else, run `./deploy.sh backup`, then copy the backups and the encryption key out of the volume and off the server, for example:

  ```bash
  docker compose cp suunto-mcp:/data/backups ./backups
  docker compose cp suunto-mcp:/data/master.key ./backups/
  ```

  and download the `backups` folder (for example with `scp`). Keep it safe: it contains the encryption key. Skip `master.key` if you set `MASTER_KEY` in `.env` (then back up `.env`).

#### MCP Registry

The service is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.Mrc527/mcp-for-suunto`, so AI apps and MCP directories can find it. The listing is [`server.json`](server.json): name, description, icons and the address `https://suunto.mcp.visin.ch/mcp`.

To publish or update it: *Actions > MCP Registry > Run workflow* on the default branch (or push a tag `v<version>`). The workflow signs in to the registry with GitHub OIDC (no secret needed), takes the version from `package.json`, validates `server.json` and publishes it. Published versions cannot be changed, so bump `version` in `package.json` before publishing again; the run stops early if that version is already in the registry. The live entry: <https://registry.modelcontextprotocol.io/v0.1/servers/io.github.Mrc527%2Fmcp-for-suunto/versions/latest>.

### Connect an AI app

The account page has a **Connect your AI app** section with one-click links and ready-to-copy commands. Every app uses the same address, `https://your-server/mcp`, and signs in with OAuth (the app opens your server, the user signs in and clicks **Allow**; no password or key goes into the app).

| App | How |
| --- | --- |
| Claude (web, desktop, mobile) | **Add to Claude** button (it fills in the name "MCP for Suunto" and the address), or *Customize > Connectors > Add custom connector*. Keep the defaults ("Use Claude's published identity"). Team and Enterprise owners add it once under *Organization settings > Connectors*. |
| ChatGPT | On chatgpt.com: *Plugins > + > Add custom MCP server*, name "MCP for Suunto", authentication *OAuth*. Availability depends on the plan and workspace settings. |
| Claude Code | `claude mcp add --transport http suunto --scope user https://your-server/mcp`, then `claude mcp login suunto` |
| Codex (CLI, IDE, ChatGPT desktop app) | `codex mcp add suunto --url https://your-server/mcp` |
| VS Code (GitHub Copilot) | **Install in VS Code** button (`vscode:mcp/install` link), or `code --add-mcp '{"name":"suunto","type":"http","url":"https://your-server/mcp"}'` |
| Visual Studio | **Install in Visual Studio** button (`vs-open.link/mcp-install`) |
| GitHub Copilot CLI | `copilot mcp add --transport http suunto https://your-server/mcp` |
| Gemini, Le Chat, Perplexity | Steps on the account page (custom app / custom MCP connector, OAuth). |
| Cursor, Kiro, LM Studio, Goose | One-click install links on the account page. |
| Gemini CLI, Devin (Windsurf), Cline, Jan | `gemini mcp add --transport http --scope user suunto ...`, `devin mcp add -s user suunto ...`, `cline mcp add suunto ... --transport http`, `jan cli mcp add suunto --type http --url ...` |
| Zed, JetBrains, Warp, Raycast, Msty, Open WebUI, LibreChat, n8n | Settings snippets and steps on the account page. |
| Other apps | Add a remote (Streamable HTTP) MCP server with the address. Apps that only start local programs, or cannot sign in to remote servers (Roo Code, Continue), can use `npx -y mcp-remote https://your-server/mcp`. |

Users can see and revoke connected apps, and a log of recent tool calls, under **Connected apps**.

### Start page, languages and logo

- The **start page** (`/`) explains the service before sign-in: what it can do, example requests, how to connect, privacy and security, and an FAQ. Signed-in people go straight to their account.
- Every page is available in **English, Italian, German, French, Spanish and Simplified Chinese**. The language follows the browser (`Accept-Language`); the menu at the bottom of every page switches it and remembers the choice in a cookie (`?lang=de` works on any page). Texts live in `src/web/i18n/<language>/<area>.ts`; English is the source and the fallback. A test renders every page and fails if any visible text bypasses the catalogs. The product name, MCP for Suunto (`common.appName`), is the same in every language.
- The **privacy policy** (`/privacy`) and the **terms of use** (`/terms`) are linked from the footer of every page, and `/.well-known/security.txt` says where to report security problems ([SECURITY.md](SECURITY.md)). They describe the hosted service, run by Marco Visin, Lugano, Switzerland. If you run your own copy, change the name, contact address and date in `src/web/operator.ts`, and the place in the legal texts (`src/web/i18n/<language>/legal.ts`).
- The **logo** is our own artwork, not Suunto's: `assets/brand/logo.svg`, and `logo-small.svg` for 16-32 px. Never use Suunto's logos or artwork in this project. `node scripts/make-icons.mjs` turns the logo into the favicon, the app icons, the icons the MCP server sends to AI apps (`src/web/brand-assets.ts`) and the 512 px directory icon (`docs/directory/icon-512.png`). It needs Playwright with Chromium; with a global install, run `NODE_PATH="$(npm root -g)" node scripts/make-icons.mjs`.
- There is no explainer video in this version. The start page leaves that section out.

### Admin page

`/admin` is available to administrators:

- **Overview** with the MCP address, user counts (also how many users have connected Suunto), and a **Check public setup** button that fetches the discovery documents from the public URL the way Claude does.
- **Suunto API**: whether the three Suunto app keys are set (the values are never shown), and the redirect URI to register in the Suunto API Zone. Without the keys, a warning says that real accounts cannot connect Suunto yet.
- **Settings**: who can create an account (request access with approval, which is the default; invite only; anyone; nobody), allowed sign-up email domains, read-only for everyone, which AI apps may connect (for example only `claude.ai claude.com`), dynamic client registration and client metadata documents, token and session lifetimes, default time zone (for users who did not choose their own on the account page).
- **Access requests**: approve or reject people who asked for an account, one by one or all at once. The menu shows how many are waiting. If the operator set `SMTP_URL`, each administrator also gets an e-mail about new requests at their sign-in address. Requests that come close together arrive in one e-mail (the first about a minute after a request, then at most one every 10 minutes). Without `SMTP_URL`, no e-mail is sent and the admin page still lists the requests. Email addresses are not verified, so anyone can type any address: before you approve, check with the person in another way that the request is theirs. People are not notified automatically, so let them know when you approve them. Unanswered requests are deleted after 30 days, at most 100 can wait at the same time, and one IP address can send 5 requests a day.
- **Invites**: create single-use invite codes with an expiry. In approval mode a valid code skips the approval.
- **Demo account for app reviewers**: create a [demo account](#demo-account) with sample data (the password is shown once), see the demo accounts and reset their data.
- **Users**: the column "Suunto" shows whether each user has connected Suunto, has not, must connect again, or uses sample data. Make or remove administrators, disable or enable accounts (disabling also disconnects their apps), reset passwords, delete accounts, turn a user into a demo account and back. The last administrator cannot be removed.
- **OAuth clients**: see which AI apps registered and remove them.

Administrators never see Suunto passwords (the server never gets them), Suunto tokens, or the users' workouts and health data.

### Demo account

App reviewers (for example for the Claude Connectors Directory) should not need a real Suunto account. A **demo account** has Suunto data simulated inside the server instead:

- **Create one** on the admin page under **Demo account for app reviewers**: type an email address for signing in (it is only the sign-in name; the server never sends mail to it) and copy the generated password, which is shown once. The account is approved and is never an administrator. You can also turn an existing user (not an administrator) into a demo account and back; their saved Suunto connection is deleted when they become one. Demo accounts work even when the server has no Suunto app keys.
- **Sample data:** the athlete is "Alex Demo" (Suunto username `alexdemo`, sign-in alex.demo@example.com), in the time zone Europe/Zurich, with metric units. There are about 120 days of invented workouts: running, trail running, cycling, hiking, open water and pool swimming, scuba diving, strength training, and cross-country skiing in winter. There is a sleep entry for every night, daily steps and energy, 24/7 samples every 10 minutes (made on demand from a fixed seed, not stored), recovery every 30 minutes, 4 routes and 5 points of interest at invented places. Dates are relative to the day of the reset, so the data always looks current. Every name, number and place is invented.
- **The same code as a real account:** `ActivityService` and every tool run unchanged. Only the Suunto backend is replaced by an in-memory one (`src/demo/activity.ts`).
- **Nothing leaves the server.** A demo account never opens a network connection: not to Suunto, and not to the operator's `SUUNTO_*_URL` overrides. Routes and points of interest added with the tools stay in the server's memory and never reach a Suunto App or a watch.
- **RAM only, reset every day.** Every change is kept in memory only. All demo accounts go back to fresh sample data every day at 04:00 Swiss time (Europe/Zurich) and whenever the server restarts. **Reset demo data now** on the admin page does it at once.
- **The account page** shows a notice instead of the Suunto connection, and keeps the read-only switch, the connected apps, the activity log and the security page. The administrator's read-only setting for everyone applies to demo accounts too.

### Web service configuration

Environment variables for `--web`:

| Variable | Default | Description |
| --- | --- | --- |
| `PUBLIC_URL` | `http://localhost:PORT` | The public HTTPS address of the server, e.g. `https://suunto-mcp.example.com`. The MCP endpoint is `PUBLIC_URL/mcp`. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens (`--port`, `--host`). The Docker image listens on `0.0.0.0`. |
| `DATA_DIR` | `./data` | Folder for the SQLite database (`suunto-mcp.db`) and the generated encryption key. |
| `MASTER_KEY` | generated | 32-byte key (64 hex or 44 base64 characters) that encrypts the stored Suunto tokens. If unset, one is created in `DATA_DIR/master.key`. `MASTER_KEY_FILE` reads it from a file. Losing it means every user has to connect Suunto again on the account page. |
| `TRUST_PROXY` | (off) | Set to `1` behind one reverse proxy so client IPs (rate limits) are read from `X-Forwarded-For`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Create this administrator account on first start (`ADMIN_PASSWORD_FILE` also works). |
| `SUUNTO_CLIENT_ID` | (none) | The client id of your app in the Suunto API Zone. See [Suunto API Zone setup](#suunto-api-zone-setup). |
| `SUUNTO_CLIENT_SECRET` | (none) | The client secret of that app. `SUUNTO_CLIENT_SECRET_FILE` reads it from a file. |
| `SUUNTO_SUBSCRIPTION_KEY` | (none) | The subscription key of your API subscription (sent as `Ocp-Apim-Subscription-Key`). `SUUNTO_SUBSCRIPTION_KEY_FILE` reads it from a file. Set all three Suunto keys or none: with only some of them the server does not start. Without them it starts, demo accounts work, and real accounts cannot connect Suunto. |
| `SUUNTO_REDIRECT_URI` | `PUBLIC_URL/suunto/callback` | Where Suunto sends users back after they allow access. It must be registered as the redirect URI of the app in the API Zone, and it must reach `/suunto/callback` on this server. |
| `SMTP_URL` | (none) | Optional SMTP server for e-mails to administrators about access requests, for example `smtps://user:password@mail.example.com:465` (`SMTP_URL_FILE` also works). Without it, no e-mail is sent. The server checks it at startup and does not start if it is not an `smtp://` or `smtps://` address with a host name. The connection must be encrypted: `smtps://` uses TLS from the start, and with `smtp://` the server must offer STARTTLS, otherwise nothing is sent, not even the password. For a mail server on the same machine without TLS, add `?requireTLS=false` to the URL. |
| `NOTIFY_FROM` | see text | Sender address of those e-mails: an address, or a name and an address (`MCP for Suunto <noreply@example.com>`). Default: the SMTP user name when it is an e-mail address. If that user name is not an e-mail address, `NOTIFY_FROM` is required: the server does not start without it. Use an address your SMTP server may send from. The server does not start if `NOTIFY_FROM` is not an e-mail address. |
| `SUUNTO_OAUTH_URL`, `SUUNTO_API_URL` | Suunto | Operator-only overrides that apply to every user, for tests against a local mock Suunto API (`https`, or `http` on a loopback address). Users can never change server addresses. |

With the Docker Compose files in `deploy/`, set these in `.env` next to the compose file. Everything else is configured on the admin page.

### How sign-in to this server works (OAuth)

The server is its own OAuth 2.1 authorization server, built to the MCP authorization specification and Claude's connector requirements:

- Discovery: unauthenticated MCP requests get `401` with `WWW-Authenticate: Bearer ... resource_metadata="..."`; protected resource metadata is served at `/.well-known/oauth-protected-resource` (and `/mcp`), authorization server metadata at `/.well-known/oauth-authorization-server`.
- Clients identify themselves with a **Client ID Metadata Document** (Claude's published identity) or **dynamic client registration**. Documents are fetched with SSRF protection, and built-in copies of Claude's and ChatGPT's documents are used if claude.ai or chatgpt.com cannot be reached.
- Authorization code flow with **PKCE (S256)**, a consent page that judges an app by where it returns to, never by the name it gives itself (well-known AI apps such as Claude and ChatGPT are shown as recognized by their exact redirect address; answers to localhost, an app's own scheme or VS Code stay on the user's device; any other address gets a warning, and Allow only works after the user ticks a box to confirm they trust it), single-use codes, tokens bound to the MCP URL (RFC 8707), **rotating refresh tokens** with reuse detection, revocation. The consent page says what the app can do: read workouts, daily activity, heart rate, sleep, recovery, routes and points of interest, and, unless the account is read-only, add routes and points of interest to the Suunto App.
- Tokens, sessions and invite codes are stored only as SHA-256 hashes; Suunto tokens are encrypted with AES-256-GCM.
- Rate limits are applied per OAuth client and per user (Claude's requests for all users come from the same few IP ranges).

This is separate from the sign-in to Suunto, described next: the AI app gets a token for this server only, never a Suunto token.

## How the Suunto connection works and what is stored

The server uses the official, documented **Suunto Cloud API** with the operator's partner keys. Each user allows access to their own Suunto account on Suunto's own page, and the server only ever reads and changes that user's own data. The API facts the code is written against are in [docs/suunto-api.md](docs/suunto-api.md).

**Connecting (OAuth 2.0 authorization code flow).**

1. The user clicks **Connect Suunto** on the account page. The server creates a random `state` (32 bytes, single use, valid for 10 minutes, tied to the signed-in user) and sends the browser to Suunto's sign-in page at `cloudapi-oauth.suunto.com`.
2. The user signs in with their Suunto App account (not an old Movescount account) and allows access. This happens on Suunto's page: the server never sees the Suunto password.
3. Suunto sends the browser back to `https://DOMAIN/suunto/callback` with a code. The server checks that the `state` is the one it created for the same signed-in user, then exchanges the code once for tokens (with the client id and secret).
4. The access token names the Suunto username. The server makes one test call (it lists the workouts of the last 30 days, at most 100, to count them) and saves the connection, encrypted, with the result of that test call (`lastCheck`: when, and the count or the error). The account page shows this saved result and never calls Suunto. If Suunto refuses the test call (for example with HTTP 403), the connection is still saved and the page says that the test request failed, and why. Errors (access refused, an old or wrong `state`, a failed exchange) lead back to the account page with a message; no Suunto text is put in the address.

**Tokens.** Every data request sends the user's **access token** (valid for 24 hours) together with the operator's subscription key. The server renews the access token with the **refresh token** when less than 5 minutes are left, and once more when Suunto answers "not signed in". Suunto may hand out a new refresh token with each renewal: the server always keeps the newest one, and renews one token at a time per user. If Suunto refuses the refresh token (`invalid_grant`), the account page and the AI app both say that the connection expired and ask the user to connect again ("Your Suunto connection expired. Connect Suunto again at https://DOMAIN/account."). The server still keeps the tokens, because Suunto has refused valid tokens by mistake during outages: for 10 minutes every tool call gets this message at once, without asking Suunto, and the first call after that tries the same refresh token once more (a new refusal starts another 10 minutes). When the refresh works again, the message goes away by itself. **Remove** on the account page tells Suunto to end the connection (best effort) and deletes the tokens.

**Hosts, limits and the cache.** The Suunto client talks only to `cloudapi-oauth.suunto.com` and `cloudapi.suunto.com` (or the operator's test overrides). Every request times out after 20 seconds (a FIT export after 60). A read is tried at most 3 times when Suunto is busy, has a server error or the minute limit is hit (HTTP 429, 500, 502, 503 and 504), waiting as long as Suunto asks (`Retry-After`), up to 30 seconds; when Suunto asks for a longer wait, the AI app gets the answer at once. When the call limit is reached (HTTP 429 for the minute limit, HTTP 403 with a text such as "Out of call volume quota" for the weekly quota, or HTTP 401 with "RateLimitExceeded"), the AI app gets "Suunto's call limit for this service is reached (HTTP 429). Try again in 60 seconds.", with the wait from Suunto's answer when it names one, else "Try again later." A call limit is never treated as a sign-in problem and never renews the tokens. A 401 whose text names the subscription key is the operator's problem ("Suunto refused this server's API subscription key."), not the user's sign-in. Writes (adding a route or a point of interest) are never retried once the request may have reached Suunto: the error says to check the Suunto App (or list the routes or points of interest) before trying again. Suunto's 24/7 data (daily activity, samples, sleep, recovery) can be read for at most 28 days per request, so the server splits longer ranges.

To stay within Suunto's call limits, each real account has a small cache of recent answers, in memory only (at most 200 answers and 20 MB per user, the oldest dropped first, lost when the server restarts): workout lists, routes (the list, a route and its GPX) and points of interest for 2 minutes; a single workout and a FIT file for 30 minutes; 24/7 data (daily activity, samples, sleep, recovery) for 30 minutes when the asked time range ended before the current hour, else for 2 minutes. The same calls at the same time share one request to Suunto. Adding a route clears the cached routes, and adding a point of interest clears the cached points of interest, also when the call failed (it may have reached Suunto). Demo accounts are not cached.

**Data freshness.** The watch sends its data to the Suunto App, and the Suunto App sends it to Suunto's cloud. A workout or a night of sleep appears here only after the watch has synced with the Suunto App.

**What is stored.**

| | Web service | Local mode |
| --- | --- | --- |
| Suunto password | Never. It is typed only on Suunto's own page. | Never. |
| Suunto tokens | Encrypted with AES-256-GCM (key in `MASTER_KEY` or `DATA_DIR/master.key`), tied to your account. A new refresh token replaces the old one. | In memory, or in the file `SUUNTO_TOKEN_CACHE` (mode 0600) if you set it. |
| Suunto app keys | Only in the server environment, set by the operator. Never shown, not even on the admin page. | Where you put them (environment variables or files). |
| Other Suunto details | Your Suunto username, units, read-only setting and time zone, and when you connected (all encrypted with the tokens). | Nothing. |
| Workouts, heart rate, sleep, recovery, routes | Never saved to disk or to the database. They pass between Suunto and your AI app; recent answers stay in the server's memory for 2 to 30 minutes (the cache above) and are gone after a restart. | The same: memory only. |
| Activity | A log of tool calls (time, app, tool, duration, success; no content), kept 90 days. | Nothing. |

## Local mode (single user)

Local mode runs the server on your own computer for one Suunto account. It needs the keys of **your own app in the Suunto API Zone** (see [Suunto API Zone setup](#suunto-api-zone-setup)). Suunto gives API access to partners (companies and organizations), not for personal use. If you have no partner app, use the [hosted service](https://suunto.mcp.visin.ch) instead.

1. **Prepare your API Zone app.** You need the client id, the client secret and the subscription key. For the one-time sign-in, register a loopback address as the redirect URI of the app, by default `http://localhost:8723/callback` (set `SUUNTO_REDIRECT_URI` to use another one; it must be an `http` address on `localhost` or `127.0.0.1` and match the registered one exactly).
2. **Build the server** (Node.js 22.13 or newer):

   ```bash
   git clone https://github.com/Mrc527/suunto-mcp.git
   cd suunto-mcp
   npm install
   npm run build
   ```

3. **Connect your Suunto account once:**

   ```bash
   export SUUNTO_CLIENT_ID='your client id'
   export SUUNTO_CLIENT_SECRET='your client secret'
   export SUUNTO_SUBSCRIPTION_KEY='your subscription key'
   export SUUNTO_TOKEN_CACHE="$HOME/.config/suunto-mcp/tokens.json"
   node dist/index.js --login
   ```

   It prints a link to Suunto's sign-in page. Open it in your browser, sign in with your Suunto App account and allow access. Suunto sends the browser back to the local address, the server writes the tokens to `SUUNTO_TOKEN_CACHE` (mode 0600), prints your Suunto username and exits. It waits at most 10 minutes, accepts exactly one answer with the right `state`, and never opens a browser by itself.

4. **Test the connection:**

   ```bash
   node dist/index.js --check
   ```

   It reads the token file, lists the workouts of the last 30 days and prints the settings (no secrets) and the account with `check.workouts_last_30_days`, as JSON (never a token). It exits with code 0 when the test call worked, else with code 1 and the reason in `check.error`.

5. **Add it to your AI client** (see [Client setup](#client-setup-local-mode)), with the same four variables.

The server keeps `SUUNTO_TOKEN_CACHE` up to date when it renews the tokens. You can also give a refresh token directly with `SUUNTO_REFRESH_TOKEN`, but Suunto may end that token after its first use (when it hands out a new one), so the next start may fail: prefer the token file.

## Client setup (local mode)

Replace the path and the values with your own. Keep the client secret and the subscription key out of files you share.

### Claude Desktop

Edit `claude_desktop_config.json` (*Settings > Developer > Edit Config*):

```json
{
  "mcpServers": {
    "suunto": {
      "command": "node",
      "args": ["/absolute/path/to/suunto-mcp/dist/index.js"],
      "env": {
        "SUUNTO_CLIENT_ID": "your client id",
        "SUUNTO_CLIENT_SECRET": "your client secret",
        "SUUNTO_SUBSCRIPTION_KEY": "your subscription key",
        "SUUNTO_TOKEN_CACHE": "/absolute/path/to/suunto-tokens.json",
        "SUUNTO_TIMEZONE": "Europe/Zurich"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add suunto \
  -e SUUNTO_CLIENT_ID=your-client-id \
  -e SUUNTO_CLIENT_SECRET_FILE=$HOME/.config/suunto-mcp/client-secret \
  -e SUUNTO_SUBSCRIPTION_KEY_FILE=$HOME/.config/suunto-mcp/subscription-key \
  -e SUUNTO_TOKEN_CACHE=$HOME/.config/suunto-mcp/tokens.json \
  -- node /absolute/path/to/suunto-mcp/dist/index.js
```

### Cursor

Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "suunto": {
      "command": "node",
      "args": ["/absolute/path/to/suunto-mcp/dist/index.js"],
      "env": {
        "SUUNTO_CLIENT_ID": "your client id",
        "SUUNTO_CLIENT_SECRET": "your client secret",
        "SUUNTO_SUBSCRIPTION_KEY": "your subscription key",
        "SUUNTO_TOKEN_CACHE": "/absolute/path/to/suunto-tokens.json"
      }
    }
  }
}
```

### VS Code

Add this to `.vscode/mcp.json` (or run *MCP: Add Server* and choose *Command (stdio)*). The top-level key is `servers`, and VS Code can ask for the secret and the key instead of storing them:

```json
{
  "inputs": [
    { "type": "promptString", "id": "suunto-secret", "description": "Suunto client secret", "password": true },
    { "type": "promptString", "id": "suunto-key", "description": "Suunto subscription key", "password": true }
  ],
  "servers": {
    "suunto": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/suunto-mcp/dist/index.js"],
      "env": {
        "SUUNTO_CLIENT_ID": "your client id",
        "SUUNTO_CLIENT_SECRET": "${input:suunto-secret}",
        "SUUNTO_SUBSCRIPTION_KEY": "${input:suunto-key}",
        "SUUNTO_TOKEN_CACHE": "/absolute/path/to/suunto-tokens.json"
      }
    }
  }
}
```

Windsurf and other stdio clients use the same `command`, `args` and `env` as the Claude Desktop example.

### Without cloning (npx from GitHub)

```json
{
  "command": "npx",
  "args": ["-y", "github:Mrc527/suunto-mcp"],
  "env": {
    "SUUNTO_CLIENT_ID": "your client id",
    "SUUNTO_CLIENT_SECRET": "your client secret",
    "SUUNTO_SUBSCRIPTION_KEY": "your subscription key",
    "SUUNTO_TOKEN_CACHE": "/absolute/path/to/suunto-tokens.json"
  }
}
```

Run the one-time `--login` first, for example with `npx -y github:Mrc527/suunto-mcp --login` and the same variables in your shell.

### Single-user HTTP mode

For a personal remote setup without accounts (clients that accept a static bearer token), start the server in HTTP mode. For Claude on the web and other hosted AI apps, use the [web service](#web-service-for-ai-apps-multi-user) instead.

```bash
MCP_HTTP_TOKEN="$(openssl rand -hex 32)" node dist/index.js --http --port 3000
```

The endpoint is `http://127.0.0.1:3000/mcp` (Streamable HTTP, stateless) and clients must send `Authorization: Bearer <token>`. By default the server only listens on `127.0.0.1`. To expose it, put it behind an HTTPS reverse proxy and set `MCP_HTTP_HOST=0.0.0.0` and `MCP_HTTP_ALLOWED_HOSTS=mcp.example.com`; the server refuses to listen on a public interface without `MCP_HTTP_TOKEN`. `GET /healthz` answers `{"status":"ok"}`.

## Configuration reference (local mode)

All settings are environment variables. You need the three Suunto app keys, and a token file written by `--login` or a refresh token. (In web mode users set the equivalent options on their account page, and the operator sets the app keys.)

| Variable | Default | Description |
| --- | --- | --- |
| `SUUNTO_CLIENT_ID` | | The client id of your app in the Suunto API Zone. |
| `SUUNTO_CLIENT_SECRET` | | The client secret of that app. `SUUNTO_CLIENT_SECRET_FILE` reads it from a file. |
| `SUUNTO_SUBSCRIPTION_KEY` | | The subscription key of your API subscription. `SUUNTO_SUBSCRIPTION_KEY_FILE` reads it from a file. |
| `SUUNTO_TOKEN_CACHE` | (none) | File with the current Suunto tokens (mode 0600, written atomically). `--login` creates it, and the server updates it when it renews the tokens. Unset: memory only. |
| `SUUNTO_REFRESH_TOKEN` | | Instead of the token file: a Suunto refresh token. `SUUNTO_REFRESH_TOKEN_FILE` reads it from a file. |
| `SUUNTO_REDIRECT_URI` | `http://localhost:8723/callback` | Only for `--login`: where Suunto sends the browser back. An `http` address on a loopback host, registered exactly like this in the API Zone. The server listens on its port during `--login`. |
| `SUUNTO_UNITS` | `metric` | Units of answers and inputs: `metric` or `imperial`. Suunto has no units setting the server can read. |
| `SUUNTO_READ_ONLY` | `false` | `true` removes every tool that adds anything (routes, points of interest). |
| `SUUNTO_TIMEZONE` | `TZ`, else the system zone | IANA time zone, for example `Europe/Zurich` (an invalid value stops the start; `TZ` is used only when it is an IANA name). Calendar dates (`from`, `to`), "today", day boundaries of daily activity and the times of 24/7 data use it. |
| `SUUNTO_OAUTH_URL`, `SUUNTO_API_URL` | Suunto | Other Suunto hosts, for tests against a local mock only. |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` (same as `--http`). |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | `127.0.0.1` / `3000` | HTTP listen address (`--host`, `--port`). |
| `MCP_HTTP_TOKEN` | | Bearer token required on every HTTP request. `MCP_HTTP_TOKEN_FILE` reads it from a file. |
| `MCP_HTTP_ALLOWED_HOSTS` | | Extra accepted `Host` header values (DNS rebinding protection). |
| `MCP_HTTP_ALLOWED_ORIGINS` | | Browser origins allowed to call the server (CORS). |

See [.env.example](.env.example) for a template. The server does not read a `.env` file by itself: set the values in your MCP client configuration (the `env` block) or in your shell. To keep them in a file, start the server with Node's `--env-file` option, for example `node --env-file=.env dist/index.js --check`. In an MCP client configuration, put `"--env-file=/absolute/path/to/.env"` before the path to `dist/index.js` in `args`.

## Tools

The AI sees these tools (write tools are hidden in read-only mode). Every tool has a description that lists the accepted values, units and limits, strictly typed parameters (unknown parameter names are rejected), and is marked as read-only or changing, so clients such as Claude can ask for confirmation first.

| Tool | Kind | What it does |
| --- | --- | --- |
| `suunto_account_info` | read | Suunto username, units, read-only, demo flag, time zone, the server's today, server version and when the Suunto access token expires. `check=true` also lists the workouts of the last 30 days to test the connection (`check.workouts_last_30_days`, at most 100); a failed sign-in then answers `connected: false` with the reason in `check.error`. |
| `suunto_list_workouts` | read | Workouts, newest first: `from`, `to` (default the last 30 days), `sport` (an activity name or a word such as run, ride, swim, hike, ski, dive, gym), `limit` 1-100 (20), `offset`, `units`. Returns the count, the workouts and the next offset. |
| `suunto_get_workout` | read | Every detail of one workout by `workout_key`: summary, laps, heart rate zones, training effect, weather, dive, swim and ski data when present. `samples` adds streams (heart_rate, altitude, speed, pace, cadence, power, temperature, depth, distance, location), each reduced to at most `max_points` points (10-1000, default 200). `units`. |
| `suunto_workout_stats` | read | Number of workouts, total time, distance, ascent, energy, average heart rate, longest and farthest workout; `from`, `to` (default the last 365 days), `sport`, `group_by` (none, week, month, year, sport), `units`. At most 2000 workouts. |
| `suunto_export_workout_fit` | read | The original FIT file of a workout (`workout_key`), as an embedded file (`application/vnd.ant.fit`). Files over 8 MB are refused. |
| `suunto_daily_activity` | read | Steps and energy (kcal) per day, with totals and averages; `from`, `to` (dates, at most 92 days; days start at local midnight), `units`. |
| `suunto_activity_samples` | read | 24/7 samples: heart rate (average, minimum, maximum), steps, energy, SpO2, HRV and altitude; `from`, `to` (dates or date-times, at most 28 days), `resolution` raw, hour or day (default hour up to 2 days, else day; raw at most 2 days), `units`. |
| `suunto_sleep` | read | One entry per sleep (naps flagged): bedtime, duration, deep, light and REM sleep, heart rate, HRV, SpO2, quality score; plus averages. `from`, `to` (dates of waking up, at most 92 days). |
| `suunto_recovery` | read | Recovery balance (%) minimum, average and maximum, and stress state; `from`, `to` (at most 28 days), `resolution` raw, hour or day (default day; raw at most 2 days). |
| `suunto_list_routes` | read | Your routes, newest first: name, distance, sports, created and changed, whether they sync to the watch. `limit` 1-50 (20), `offset`, `units`. |
| `suunto_get_route` | read | One route by `route_id`: a summary (`format` summary, the default), or the GPX file (`format` gpx, at most 1 MB). `units`. |
| `suunto_list_pois` | read | Your points of interest: name, position, altitude, type, sport, created. `limit` 1-100 (50), `offset`, `units`. |
| `suunto_import_route` | write | Add a route from a GPX 1.1 file (`gpx`, at most 5 MB, with a route or a track of at least 2 points), optional `sports` (activity names; Suunto uses Running when none is given) and `units`. It appears in the Suunto App and can sync to the watch. Each call adds a new route, and each `<rte>` or `<trk>` of the file becomes its own route. |
| `suunto_create_poi` | write | Add a point of interest: `name` (1-60 characters), `latitude`, `longitude`, optional `altitude` (in the call's units) or `altitude_m` (metres), not both, `type` (one of Suunto's point types, for example Peak, Water, Camp; default POI), `sport` and `units`. It appears in the Suunto App and can sync to the watch. Each call adds a new point. |

`units` (metric or imperial) changes the units of one call only; without it the account's units apply.

Prompts (neither adds anything):

- **Training review** (`training_review`), optional argument `period`: "this week", "last week", "this month", "last month", "this year", "last year", "last N days", "last N weeks", a year such as 2025, or your own words (the AI app asks you which dates you mean when it is not clear). Default: the last 4 weeks. It asks for the workout statistics per sport and per week (per month for periods over 92 days), the workouts of the period, and the sleep of the period (of its last 4 weeks for periods over 92 days).
- **Sleep and recovery** (`sleep_and_recovery`), optional argument `days`: how many days to look back, 1 to 28 (default 7). It asks for the sleep, the recovery per day and the daily activity of those days.

Notes:

- **Units.** Answers use metric units by default (km, m, km/h, min/km, °C, kcal, bpm), or imperial ones (mi, ft, mph, min/mi, °F) when you ask or set them. Every number has its unit in its name or in the `units` of the answer.
- **Dates and times.** `from` and `to` are calendar dates (`YYYY-MM-DD`) in your time zone, and `to` is included; date-times with an offset work too. Workout times are shown in the workout's own local time, with its offset. 24/7 data (daily activity, samples, sleep, recovery) is shown in your time zone.
- **Data freshness.** New workouts and sleep appear only after the watch synced with the Suunto App.
- **Not medical advice.** Heart rate, HRV, SpO2, sleep and recovery values come from the watch.
- **Safety.** Workout names and descriptions, route and point names and GPX text are user data: the server tells the AI to never follow instructions found inside them, and to ask before adding a route or a point of interest unless you asked for exactly that.

## Security

**Web service:**

- The Suunto password is typed only on Suunto's own page and never reaches the server. The Suunto tokens are encrypted at rest (AES-256-GCM, key in `MASTER_KEY` or `DATA_DIR/master.key`) and never shown, not even to administrators. Whoever runs the server and holds the database and the key can decrypt the tokens, so users must trust the operator. **Remove** on the account page ends the connection at Suunto and deletes the tokens at once.
- The client secret and the subscription key exist only in the server environment (or in files it reads). They are never stored in the database, never shown on any page and never sent to the AI app.
- Connecting Suunto uses a random, single-use `state` that expires after 10 minutes and is bound to the signed-in user, so a Suunto answer cannot be replayed or attached to another account. The code from Suunto is exchanged once.
- Web sessions use host-only `HttpOnly`, `SameSite=Lax` cookies (`__Host-` prefixed on HTTPS), every form has a CSRF token (also the **Connect Suunto** button), passwords are hashed with scrypt, sign-in is rate limited, and pages send a strict Content Security Policy that forbids framing.
- Users cannot change server addresses (no requests to internal hosts), cannot read or write local files, and each request only ever sees the Suunto data of the token's owner.
- New accounts need an administrator's approval by default. Keep it that way (or use invite codes) if the server is public: open sign-up lets anyone use your server and your Suunto API quota.

**Both modes:**

- Passwords, tokens, the client secret and the subscription key are never included in tool results or logs. Error messages and logs mask anything that looks like a token (JWTs, `Bearer` and `Basic` values) and the configured secrets, and logs never contain e-mail addresses.
- The Suunto account is always the one of the signed-in user's own token, never one the AI app names.
- **Read-only mode** (`SUUNTO_READ_ONLY=true`, or the switch on the account page) removes every tool that can add anything.
- GPX files are checked before they are sent to Suunto (size, root element, number of points), and files with a `DOCTYPE` or `ENTITY` declaration are refused. Still, review what your AI client does (most clients ask for approval per tool call).
- The token cache file (`SUUNTO_TOKEN_CACHE`) is written with mode 0600. Treat it like a password.
- The HTTP mode listens on `127.0.0.1` by default, checks the `Host` and `Origin` headers, compares the bearer token in constant time and refuses public interfaces without a token. Always put it behind HTTPS when exposing it.

How to report a security problem: [SECURITY.md](SECURITY.md).

## Troubleshooting

Run `node dist/index.js --check` first (local mode), or ask the AI app to check the connection (`suunto_account_info` with `check`). In the web service, the account page shows whether Suunto is connected and what the test call found when you connected.

| Problem | Fix |
| --- | --- |
| "Your Suunto connection expired" or "Suunto refused the sign-in" | Suunto ended the connection, for example because you removed the service in the Suunto App or the refresh token got too old. Web service: click **Reconnect** on the account page. Local mode: run `node dist/index.js --login` again. (During a Suunto outage this message can also appear by mistake: the first tool call after 10 minutes tries the saved token again, and the message goes away when Suunto accepts it again.) |
| "The administrator of this server has not set up the Suunto connection yet" | The server has no Suunto app keys. Operator: set `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET` and `SUUNTO_SUBSCRIPTION_KEY` (see [Suunto API Zone setup](#suunto-api-zone-setup)) and restart. Demo accounts work meanwhile. |
| Suunto's page shows an error about the redirect URI | The redirect URI the server sends is not the one registered for the app. Register exactly `https://DOMAIN/suunto/callback` in the API Zone (*Profile > OAuth settings*), or set `SUUNTO_REDIRECT_URI` to the registered one. Local mode: the default is `http://localhost:8723/callback`. |
| "Bad client credentials" when connecting | The client id or the client secret is wrong (operator), or the user signed in with an old Movescount account instead of their Suunto App account. |
| Back on the account page with "This Suunto sign-in expired or was already used" | The Suunto page was open for more than 10 minutes, was started in another browser, or another user signed in meanwhile. Click **Connect Suunto** again. |
| "Suunto refused the request" (HTTP 403) | The subscription key does not cover this API (check the subscription in the API Zone, and that `SUUNTO_SUBSCRIPTION_KEY` belongs to it), or the user did not allow this data. When connecting, the server saves the connection even if this first test call is refused, and says so. |
| "Suunto's call limit for this service is reached" | Wait until the time the message names ("Try again in ...") and try again; it is not a sign-in problem, so do not connect again. The Developer API allows 10 calls per minute and 200 calls per week for the whole app, shared by all users: a busy server needs the Production API. |
| "Suunto is busy" | Suunto's 24/7 data answers "busy" (HTTP 503) at peak times, more often at weekends. Try again later. |
| "Suunto refused this server's API subscription key" | Operator: `SUUNTO_SUBSCRIPTION_KEY` is empty, mistyped, or belongs to a subscription that was cancelled. Copy it again from the API Zone and restart. This is not a problem of the user's sign-in. |
| No workouts, no sleep, or old data | Sync the watch with the Suunto App first: data reaches Suunto's cloud, and so this server, only after a sync. Sleep, recovery and 24/7 data also need a watch that records them. |
| The AI app uses the wrong date for "today" or "this week" | Web service: choose your time zone on the account page. Local mode: set `SUUNTO_TIMEZONE`. |
| Distances or temperatures in the wrong units | Ask for the units you want, or set `SUUNTO_UNITS` (or the units on the account page). |
| A route import is refused | The GPX file must be GPX 1.1, at most 5 MB, with a route (`<rte>`) or a track (`<trk>`) of at least 2 points, and without a `DOCTYPE`. |
| Claude cannot connect to the web service | Check `https://DOMAIN/healthz` from outside, the reverse proxy (keep the `Host` and `WWW-Authenticate` headers) and Cloudflare bot protection. **Check public setup** on the admin page shows what Claude sees. |

## Development

```bash
npm install
npm run build          # compile to dist/
npm run dev            # run from source with tsx
npm run typecheck
npm test               # unit tests (integration tests are skipped)
npm run check          # node dist/index.js --check with your local settings
```

The unit tests use a mocked `fetch` for the Suunto client (authorize address, code exchange, refresh and token rotation, one refresh at a time, one retry after 401, a refused refresh that asks the user to connect again, 403, 404 and 429 answers, `Retry-After`, no retry of writes, deauthorize), and cover the response cache (how long each kind of answer is kept, size limits, clearing after a write), the activity service (units, every kind of Suunto data, 28-day windows, dates and time zones with daylight saving time, totals and statistics, the sport filter, downsampling, GPX checks), the MCP tool surface (tool list, annotations, read-only mode, strict arguments, redaction), the demo data, and the web service (sign-up, sign-in, CSRF, account settings, connecting Suunto with a mock Suunto OAuth server: `state` checks, wrong user, expired `state`, refused access, reconnect, remove with deauthorize; the full OAuth flow with the SDK's OAuth client as Claude would run it, token refresh and reuse detection, client metadata documents, admin controls, security headers, translations).

End-to-end tests run the real server against an in-process mock of the Suunto API (`test/helpers/mock-suunto.ts`: OAuth, workouts, 24/7 data, routes and points of interest): the built `dist/index.js` with `--login` (through the mock's sign-in page), `--check`, over stdio and with `--http`, sharing one token cache; the services in process (call limits, a refused refresh token); and the web service with a full "Connect Suunto" flow, an AI app connected over OAuth like Claude, and a demo account. They never talk to Suunto and need no Suunto account or keys:

```bash
npm run build
SUUNTO_MCP_IT=1 npm run test:integration
```

Test data is always invented: never put real names, usernames, workouts, tokens or keys from real accounts into code, tests or docs.

Project layout:

```
src/
  index.ts            CLI entry point (stdio / --web / --http / --check / --login)
  config.ts           environment configuration
  server.ts           MCP server, instructions, prompts, service wiring
  http.ts             Streamable HTTP transport with auth and Host/Origin checks
  tooling.ts          tool registration helpers (errors, read-only gating, annotations, redaction)
  suunto/             Suunto client: endpoints, OAuth, token session, HTTP, API, activity ids
  activity/           the contract (types.ts), units, formatting, response cache, ActivityService,
                      MCP tools
  demo/               the in-memory demo account and its invented sample data
  util/               dates, text helpers, errors
  web/                multi-user web service: SQLite store, encryption, OAuth provider,
                      start, account and admin pages, Suunto connect flow, per-user MCP
                      endpoint and connection pool
  web/i18n/           page texts per language (en is the source)
assets/brand/         the logo (SVG); scripts/make-icons.mjs makes the icons from it
deploy/               Docker Compose with Caddy, nginx example
deploy/server/        production stack and deploy script used by the CI/CD pipeline
docs/                 design notes, the Suunto API notes, Connectors Directory texts
scripts/              build helper, Docker image smoke test, icon generator
.github/              CI/CD and MCP Registry workflows, SSH deploy script
```

## License

MIT. MCP for Suunto is an independent open-source project. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto. Suunto is a registered trademark of Suunto Oy.
