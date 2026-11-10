# MCP for Suunto: design

This is the design and the internal contract of **MCP for Suunto** (`suunto-mcp`), an MCP server
that lets AI apps (Claude, ChatGPT, Codex, VS Code, Cursor and others) read a person's **Suunto**
data: workouts, daily steps and energy, 24/7 heart rate, sleep, recovery, routes and points of
interest, and add routes and points of interest to the Suunto App (they can sync to the watch).

It is built from the template [MCP for PADI](https://github.com/Mrc527/PADI-MCP), itself built from
[icloud-mcp](https://github.com/Mrc527/icloud-mcp) (same author, MIT): same two run modes, same web
service (accounts, OAuth 2.1 for MCP clients, consent page, admin page, access requests, 6
languages, demo accounts, Docker, CI deploy), same code style. The PADI logbook is replaced by
the Suunto Cloud API.

Unlike PADI, Suunto has an **official API** (the Suunto Cloud API, https://apizone.suunto.com).
The operator of the service is an accepted member of the Suunto Partner program. People connect
their Suunto account with Suunto's own OAuth 2.0 sign-in page: this server never sees their Suunto
password. The facts about the API are in [`suunto-api.md`](suunto-api.md).

The repository replaces an older Next.js prototype (Vercel, Postgres). Nothing of it is kept.

Writing rules for every text in this repository (code comments, docs, UI texts, commit
messages): simple English, short sentences, **never the em dash character**, no "I'm thrilled".

## 1. Names

| Thing | Value |
| --- | --- |
| Product name (UI, docs) | MCP for Suunto |
| npm package, binary, Docker image, compose service | `suunto-mcp` |
| GitHub repo | `Mrc527/suunto-mcp` (image `ghcr.io/mrc527/suunto-mcp`) |
| MCP registry name (`server.json`) | `io.github.Mrc527/mcp-for-suunto` |
| Hosted service | `https://suunto.mcp.visin.ch` (MCP address `https://suunto.mcp.visin.ch/mcp`), deployed to `nebula.visin.ch` like PADI and iCloud |
| Suunto OAuth redirect URI of the hosted service | `https://suunto.mcp.visin.ch/suunto/callback` |
| MCP `serverInfo.name` | `suunto-mcp` |
| OAuth scope (our own OAuth server for AI apps) | `suunto` |
| Cookie prefix | `sum_` |
| SQLite file | `suunto-mcp.db` |
| HKDF info for the user secret box | `suunto-mcp user settings v1` |
| Env prefix (single-user mode and operator settings) | `SUUNTO_` |
| Integration test gate | `SUUNTO_MCP_IT=1` |

Trademark line (footer, README, legal pages): "MCP for Suunto is an independent open-source
project. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or
endorsed by Suunto. Suunto is a registered trademark of Suunto Oy." Never use Suunto artwork or
logos; the project logo is our own.

Not medical advice: the start page, terms and server instructions say that heart rate, sleep and
recovery values come from the watch and are not medical advice.

## 2. Run modes (same as the template)

| | Web service (multi-user) | Local (single user) |
| --- | --- | --- |
| Start | `suunto-mcp --web` (or Docker) | `suunto-mcp` (stdio), `suunto-mcp --http`, `suunto-mcp --check`, `suunto-mcp --login` |
| Suunto app keys | the operator's: `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET`, `SUUNTO_SUBSCRIPTION_KEY` (each also `_FILE`) | the same three variables, from the person's own Suunto API Zone app |
| Sign-in to Suunto | each user clicks "Connect Suunto" on the account page: Suunto's OAuth page, then back to `/suunto/callback`. Only encrypted tokens are kept | `suunto-mcp --login` runs the same OAuth flow once with a local redirect and writes `SUUNTO_TOKEN_CACHE`; or `SUUNTO_REFRESH_TOKEN` |

The web service starts even when the Suunto app keys are missing: demo accounts work, the account
page says "the administrator has not set up the Suunto connection yet", the admin page shows a
warning and the redirect URI to register. Tools of a real account then answer with that message.

## 3. Source layout

```
src/
  index.ts            CLI (stdio / --web / --http / --check / --login / --help)    [template, adapted]
  config.ts           AppConfig from env                                         [rewritten]
  server.ts           createServices / createMcpServer / prompts                 [rewritten]
  tooling.ts          registerTool (read-only gating, annotations, redaction)    [template, as is]
  http.ts             single-user Streamable HTTP                                 [template]
  version.ts                                                                      [template]
  util/errors.ts      + redaction of JWTs, Bearer and Basic tokens                [template, adapted]
  util/dates.ts, util/text.ts                                                     [template, + helpers below]
  suunto/
    endpoints.ts      default URLs; operator overrides (SUUNTO_OAUTH_URL, SUUNTO_API_URL)
    jwt.ts            decode (no verification) a JWT payload; `user` claim, `exp`
    oauth.ts          authorizeUrl(), exchangeCode(), refreshTokens(), deauthorize(); SuuntoAuthError
    session.ts        SuuntoSession: token manager, single-flight refresh, TokenSink
    http.ts           fetch wrapper: timeouts, retry with backoff on 429/5xx (reads only), error mapping
    api.ts            SuuntoApi implements ActivityBackend (wire level)
    activities.ts     Suunto activity ids: id -> name, name/alias -> ids (from suunto-api.md)
  activity/
    types.ts          THE CONTRACT: wire types, domain types, ActivityBackend
    units.ts          metric/imperial conversion and formatting
    format.ts         wire -> domain (workouts, samples, sleep, recovery, daily, routes, POIs)
    service.ts        ActivityService: validation, time windows, chunking, aggregation, stats
    tools.ts          MCP tools (registerActivityTools)
  demo/
    index.ts          demo registry (template, adapted: one store per demo user)
    activity.ts       DemoActivityBackend implements ActivityBackend (in memory)
    activity-data.ts  sample data generator (invented, deterministic, relative to the reset day)
  web/                template web service, adapted (see section 8)
test/unit, test/integration, test/helpers                                        [template, adapted]
```

Files of the PADI template that are dropped: `src/padi/**`, `src/logbook/**`,
`src/demo/logbook*.ts`, `docs/padi-api.md` and their tests.

## 4. Suunto backend (summary; details in suunto-api.md)

- **Hosts.** OAuth: `https://cloudapi-oauth.suunto.com`. Data: `https://cloudapi.suunto.com`.
  Operator overrides for tests only: `SUUNTO_OAUTH_URL`, `SUUNTO_API_URL` (never per user).
- **Every data request** sends `Authorization: Bearer <access token>` and
  `Ocp-Apim-Subscription-Key: <SUUNTO_SUBSCRIPTION_KEY>`, plus `Accept` and a `User-Agent`
  `suunto-mcp/<version>`.
- **Authorize.** Browser redirect to
  `GET /oauth/authorize?response_type=code&client_id=<id>&redirect_uri=<uri>&state=<state>`.
  The callback gets `code` and `state` (or `error`).
- **Token.** `POST /oauth/token` with `Authorization: Basic base64(client_id:client_secret)` and an
  `application/x-www-form-urlencoded` body: `grant_type=authorization_code&code=..&redirect_uri=..`
  or `grant_type=refresh_token&refresh_token=..`. Answer: `{access_token, token_type, refresh_token,
  expires_in, scope}`. The access token is a JWT with the claim `user` (the Suunto App username)
  and `exp`. A refresh may hand out a new refresh token: always keep the newest one.
- **Refresh** when less than 5 minutes are left (or when `exp` is unknown and the token is older
  than `expires_in`), once on HTTP 401, one refresh at a time per session. An `invalid_grant`
  (HTTP 400/401) answer to a refresh means the user must connect again (TokenSink.invalid).
- **Deauthorize.** `GET /oauth/deauthorize?client_id=<id>` with the Bearer access token. Called,
  best effort, when the user removes the connection or deletes the account here.
- **Errors.** The data gateway answers errors as plain text, not JSON, with a code in brackets at
  the end of the first line, for example "JWT not present. (TokenNotPresent)" (suunto-api.md
  section 6b). A 401 that names the subscription key ("(SubscriptionKeyInvalid)") is an operator
  error ("Suunto refused this server's API subscription key"), never a refresh. Any other 401
  (for example a `Token...` code): refresh once and send once more; a second 401: "Suunto refused
  the sign-in. Connect Suunto again at <PUBLIC_URL>/account". 403: "Suunto refused <what> (HTTP
  403)" (the subscription key does not cover this API, or Suunto does not allow it for this
  account). 404: not found (workout key, route id). 503 on a read: "Suunto is busy right now".
  500 with a workout key: "Suunto could not answer (HTTP 500, ...)" plus a hint to check the key.
  Writes are never retried after the request may have reached Suunto: the error says "check
  before you try again".
- **Retries** (reads only, at most 3 tries, backoff): only HTTP 429, 502, 503, 504 and network
  errors, also while the answer is read. Never 500 (Suunto answers a malformed or unknown workout
  key with 500, and every try counts against the call limit). `Retry-After` is honoured up to
  30 s; a longer one, or a 429 without `Retry-After`, ends the tries at once. A read that timed
  out reached Suunto: it is tried again at most once, and the FIT export never
  (`retryOnTimeout: false`). A connection that never opened may be tried again for any request.
- **Timeouts** 20 s per request (FIT export 60 s).
- **Rate limits.** The Developer API allows 10 calls per minute and at most 200 calls per week
  per subscription; Production limits are higher but not published, and Suunto forbids polling.
  So: (1) every real account's backend is wrapped in a small response cache
  (`src/activity/cache.ts`, `CachedBackend implements ActivityBackend`, per user, in memory, LRU
  with at most 200 entries and 20 MB): workout lists 2 minutes, a workout by key and FIT files
  30 minutes, 247 data and daily statistics 30 minutes for windows that end before the current
  hour and 2 minutes otherwise, routes and POIs 2 minutes; a successful route import or POI create
  clears the route or POI entries. The demo is not cached. (2) No call to Suunto when a web page
  is only shown (the account page shows what was saved at connect time). (3) The gateway answers
  429 (minute limit, `Retry-After`), 403 with a text such as "Out of call volume quota" (weekly
  quota), and possibly 401 with "RateLimitExceeded": all three are rate limit errors ("Suunto's
  call limit for this service is reached; try again in <time>"), never a sign-in problem and never
  a refresh. A 401 whose body names the subscription key is an operator configuration error.
- **Call limiter.** One process-wide `CallLimiter` (`src/suunto/limiter.ts`) is asked before
  every data request that is sent (retries included; OAuth calls and demo accounts never count):
  - `SUUNTO_CALLS_PER_MINUTE` (default 10, Suunto's Developer limit; 0 = off): a sliding window
    of 60 s for the whole process. A request without a free slot waits for one, up to 45 s; a
    longer wait fails at once with a `rate_limit` error ("Suunto's call limit for this service is
    reached. Try again in <time>.").
  - `SUUNTO_CALLS_PER_USER_PER_DAY` (0 = off): at most this many requests per user id and UTC day
    ("You reached this service's daily limit of <n> Suunto requests for your account. Try again
    tomorrow."). Default 100 in the web service (`WEB_DEFAULT_LIMITS`), so one account cannot use
    up the shared weekly quota; default 0 in single-user mode, where the whole process is one key.
  - `callLimitsFromEnv` (src/config.ts) reads both; an empty value means the default, a value that
    is not a whole number of 0 or more is a ConfigError at startup. The deploy compose files pass
    both as `${VAR:-}`. The admin page's Suunto API card shows the limits in use. The test request
    of "Connect Suunto" counts too. Raise both after Suunto accepts the Production subscription.
- **Workout keys** are checked (24 hex characters, `WORKOUT_KEY` in src/activity/service.ts)
  before any request: Suunto answers any other key with HTTP 500.
- **Workout lists** do not trust the order of Suunto's list (it is not documented). The service
  walks the range backward from its end in time windows (the first 60 days, the next sized from the
  count of the last), asks each window with `filter-by-modification-time=false` and limit 100,
  keeps only whole windows and sorts newest first itself. It stops when the list page (plus one)
  is known, at the cap (1000 for lists, 2000 for statistics) or after 40 requests; a window
  stopped by a call limit is dropped and the answer says which part is missing.
- **One session per connection.** The web pool keeps one `SuuntoSession` and one cached backend
  per user and connection (user id + connectedAt) across rebuilds of the user's services
  (`CreateServicesOptions.reuse`), so there is never more than one refresh per user and the cache
  survives settings changes. Unused entries are closed after `POOL_IDLE_MS` (35 minutes, longer
  than the 30 minute cache entries). Token sinks have `load()`: a session adopts a newer stored
  refresh token before it refreshes and after an `invalid_grant`, and newer stored tokens end the
  invalid_grant cool-down at once. The web sink returns the stored tokens of the same connection
  only; the single-user `fileTokenSink` reads `SUUNTO_TOKEN_CACHE` again, so processes that share
  the file never use a rotated refresh token, and a running server picks up a new `--login`
  without a restart.
- **False invalid_grant.** Suunto has answered `invalid_grant` by mistake during outages and
  accepted the same refresh token later. So an `invalid_grant` marks the connection
  `needsReconnect` but keeps the stored tokens, and the session tries the refresh again after a
  cool-down of 10 minutes (not on every call); a refresh that works again clears
  `needsReconnect`. Tool calls are not blocked by the flag; they get the session's error
  ("Your Suunto connection expired. Connect Suunto again at <PUBLIC_URL>/account").
- **Windows.** 247 endpoints accept at most 28 days per request: the service splits longer ranges.
- **Units on the wire** (from suunto-api.md): seconds, metres, m/s, kcal for workouts, joules for
  247 energy, kelvin for workout temperatures, SpO2 and recovery balance as 0..1 fractions,
  timestamps epoch ms (workouts) or ISO strings in UTC (247).

## 5. The contract (`src/activity/types.ts`)

The file `src/activity/types.ts` is written first and is the contract; read it there. Summary:

- `UnitChoice = "metric" | "imperial"` (Suunto has no readable units setting; default metric).
- Wire types exactly as the API returns them, every field optional or nullable except keys:
  `WireWorkout`, `WireWorkoutList`, `WireSample<T>` with `WireActivityEntry`, `WireSleepEntry`,
  `WireRecoveryEntry`, `WireDailyStatistic`, `WireRoute`, `WirePoi`, `WirePoiInput`.
- `ActivityBackend`: raw operations against Suunto (or the demo). No validation, no unit
  conversion, no windows longer than the API allows.
- Domain types returned by tools: `WorkoutSummary`, `Workout`, `DaySummary`, `SamplePoint`,
  `SleepNight`, `RecoveryPoint`, `RouteSummary`, `PoiSummary`, `SuuntoAccount`.

`ActivityService` (in `service.ts`) wraps a backend:
`new ActivityService(backend, { readOnly, units, timeZone, now? })` with methods `listWorkouts`,
`getWorkout`, `workoutStats`, `exportFit`, `dailyActivity`, `activitySamples`, `sleep`,
`recovery`, `listRoutes`, `getRoute`, `listPois`, `importRoute`, `createPoi`, `account`, `check`.
Every write calls `assertWritable()` (throws `ReadOnlyError`). Input validation (zod schemas,
exported from `service.ts` so tools reuse them) happens here, not in the backend.

## 6. MCP tools

All dates `YYYY-MM-DD` are calendar dates in the user's time zone (`config.timeZone`); `to` is
inclusive. Date-times may also be given as ISO 8601 with an offset. Workout times are shown in the
workout's own local time (`startTime` + `timeOffsetInMinutes`), with the offset. 247 times are
shown in the user's time zone, with the offset. Every number has its unit in the field name or
in a `units` object, as in MCP for PADI.

| Tool | Kind | Inputs | Notes |
| --- | --- | --- | --- |
| `suunto_account_info` | read | `check?` | Suunto username, units, read-only, demo flag, time zone, server's today (`today`, `time_zone`, `today_note`), server version, token expiry; `check` lists one workout to test the connection, and with `check` a failed sign-in answers `connected: false` with the error instead of failing |
| `suunto_list_workouts` | read | `from?`, `to?` (default: the last 30 days), `sport?` (activity name or alias, see activities.ts), `limit` 1-100 (20), `offset` (0), `units?` | newest first, filtered by start time (`filter-by-modification-time=false`). Returns `{total_in_range?, count, workouts:[WorkoutSummary], next_offset?, units}`. With `sport`, filtering is done on our side over the whole range (fetch pages of 100 up to 1000 workouts, then filter and page); the answer says when the 1000 cap was hit |
| `suunto_get_workout` | read | `workout_key`, `samples?` (list of: heart_rate, altitude, speed, pace, cadence, power, temperature, depth, distance, location), `max_points` 10-1000 (200), `units?` | full `Workout`: summary fields, laps when present, extension summaries (SummaryExtension, FitnessExtension, IntensityExtension, WeatherExtension, DiveHeaderExtension, SwimmingHeaderExtension, SkiExtension), heart rate zones when present. With `samples`, the requested streams, downsampled to at most `max_points` points each (even spacing in time, keep first and last point; min/avg/max kept per stream) |
| `suunto_workout_stats` | read | `from?`, `to?` (default: the last 365 days), `sport?`, `group_by?` none/week/month/year/sport (none), `units?` | count, total time (h:mm:ss and seconds), distance, ascent, energy (kcal), average heart rate (time-weighted), longest, farthest, per group. At most 2000 workouts (says so when capped) |
| `suunto_export_workout_fit` | read | `workout_key` | the FIT file as an embedded resource (`blob`, mimeType `application/vnd.ant.fit`, uri `suunto://workouts/<key>.fit`) after a short JSON text `{workout_key, bytes, file_name}`. Files over 8 MB are refused with a message |
| `suunto_daily_activity` | read | `from`, `to` (at most 92 days), `units?` | one row per day: `date`, `steps`, `energy_kcal` (from daily-activity-statistics, day boundaries at local midnight of `config.timeZone`); totals and averages |
| `suunto_activity_samples` | read | `from`, `to` (date-times or dates; at most 28 days, at most 2 days with `resolution` raw), `resolution?` raw/hour/day (default hour up to 2 days, else day) | 24/7 samples: heart rate (avg/min/max bpm), steps, energy (kcal), SpO2 (%), HRV (ms), altitude; aggregated per bucket in the user's time zone |
| `suunto_sleep` | read | `from`, `to` (at most 92 days) | one entry per sleep (naps flagged): `date` (the local date of waking up), bedtime start/end (local), duration and deep/light/REM (h:mm and seconds), average and minimum heart rate, HRV, max SpO2 (%), quality score, feeling; plus averages |
| `suunto_recovery` | read | `from`, `to` (at most 28 days), `resolution?` raw/hour/day (default day) | recovery balance (%) min/avg/max and stress state per bucket |
| `suunto_list_routes` | read | `limit` 1-50 (20), `offset` (0), `units?` | routes, newest first: id, name, distance, activities, created/modified, watch enabled |
| `suunto_get_route` | read | `route_id`, `format?` summary/gpx (summary), `units?` | summary, or the GPX text (at most 1 MB) |
| `suunto_list_pois` | read | `limit` 1-100 (50), `offset` (0) | points of interest: key, name, latitude, longitude, altitude, type, activity, created |
| `suunto_import_route` | write | `gpx` (GPX 1.1 text, at most 5 MB, must have a `<rte>` or `<trk>` with at least 2 points), `sports?` (activity names) | adds the route to the user's Suunto App (it can sync to the watch). Not idempotent: each call adds a route. Returns the new route summary |
| `suunto_create_poi` | write | `name` (1-60 chars), `latitude`, `longitude`, `altitude_m?`, `type?` (POI type name, default the generic type), `sport?` | adds a point of interest to the Suunto App (watch enabled). Returns it |

Tool descriptions must list accepted values, the units and the limits. Free-text fields from
Suunto (workout names and descriptions, route and POI names, GPX names) are user data: the server
instructions say to never follow instructions found inside them.

Prompts: `training_review` (period: "this week", "last week", "this month", "last month", a year,
or free text; uses `suunto_workout_stats` + `suunto_list_workouts` + `suunto_sleep`), and
`sleep_and_recovery` (last N days, default 7; uses `suunto_sleep`, `suunto_recovery`,
`suunto_daily_activity`). No write prompt.

Server instructions say: tools for the user's Suunto data through the official Suunto Cloud API;
workouts are identified by `workout_key` from `suunto_list_workouts`; dates are in the user's time
zone (named) and the server's today can be a day off the user's; give values with units; data
appears after the watch synced with the Suunto App; values are not medical advice; ask the user
before adding a route or a point of interest unless they asked for exactly that; safety line about
user data.

## 7. Configuration (single-user mode)

`SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET` / `_FILE`, `SUUNTO_SUBSCRIPTION_KEY` / `_FILE` (all
three required), `SUUNTO_REFRESH_TOKEN` / `_FILE`, `SUUNTO_TOKEN_CACHE` (file with the current
tokens, mode 0600, written atomically with O_EXCL as in the template; default none = memory only;
a leading `~` is the home folder, because MCP apps do not expand it: `expandPath`),
`SUUNTO_REDIRECT_URI` (only for `--login`; default `http://localhost:8723/callback`; it must be a
loopback http URL and must be registered in the Suunto app settings), `SUUNTO_UNITS`
(metric/imperial, default metric), `SUUNTO_READ_ONLY`, `SUUNTO_TIMEZONE` (default `TZ` when it is
an IANA name, else the system's), `SUUNTO_CALLS_PER_MINUTE` (default 10) and
`SUUNTO_CALLS_PER_USER_PER_DAY` (default 0 here) of section 4 (`AppConfig.callLimits`), plus the
template's `MCP_HTTP_*` settings and the operator URL overrides of section 4.
`AppConfig.secrets` holds the client secret, the subscription key, the refresh token and the HTTP
token for redaction. An empty value means "not set" everywhere (Docker Compose passes unset
variables as empty strings).

The serving modes need a sign-in: `SUUNTO_REFRESH_TOKEN` or an existing token cache. A token cache
that exists but cannot be used (`inspectTokenCache`: unreadable, not JSON, no refresh token or
client id, or written for another `SUUNTO_CLIENT_ID`) is never skipped in silence: it is a
ConfigError that names the file and says to run `--login` again, or a warning when
`SUUNTO_REFRESH_TOKEN` is set (that token is used, and the next refresh replaces the file).

Flags: `--login` cannot be combined with `--check`, `--web`, `--http` or `--stdio`; `--web` cannot
be combined with `--check`, `--http` or `--stdio`.

`suunto-mcp --login`: needs the three keys and `SUUNTO_TOKEN_CACHE`. It listens on the loopback
address and port of `SUUNTO_REDIRECT_URI`, prints the authorize URL (with a random `state`),
accepts exactly one callback with the right `state` within 10 minutes, exchanges the code, writes
the token cache, prints the Suunto username and exits. It never opens a browser by itself.

## 8. Web service changes (relative to the template)

- **Operator settings** (environment, never per user): `SUUNTO_CLIENT_ID`,
  `SUUNTO_CLIENT_SECRET` (`_FILE`), `SUUNTO_SUBSCRIPTION_KEY` (`_FILE`), optional
  `SUUNTO_REDIRECT_URI` (default `<PUBLIC_URL>/suunto/callback`), `SUUNTO_CALLS_PER_MINUTE` and
  `SUUNTO_CALLS_PER_USER_PER_DAY` (section 4; defaults 10 and 100 here), and the test-only URL
  overrides. A configured `SUUNTO_REDIRECT_URI` must be on the origin of `PUBLIC_URL` (only there
  does the browser send the sign-in cookie), have the path of the callback route below
  `PUBLIC_URL`'s path, and be https (plain http only on a loopback host); anything else is a
  ConfigError at startup (`suuntoRedirectUri` in src/web/server.ts).
- **Host header.** Every request except `/healthz` must name this server (`isPublicHost`): the
  host of `PUBLIC_URL`, or any loopback name when `PUBLIC_URL` is a loopback address. Other names
  get HTTP 421, so a web page cannot reach a server through DNS rebinding. `/healthz` stays open
  because health checks ask by address.
- **Account page** ("Connect your Suunto account"): before a connection, a short text and a
  "Connect Suunto" button (a POST form with the CSRF token). The server creates a random `state`
  (32 bytes, base64url), stores it (table `suunto_oauth_states`: state hash, user id, created_at,
  `next`), and redirects (303) to Suunto's authorize URL. States are single-use and expire after 10
  minutes; at most 5 open states per user (oldest dropped).
- **Callback** `GET /suunto/callback?code=..&state=..` (or `error=..`): needs the signed-in user who
  started it (same user id as the state). Checks and consumes the state, exchanges the code, reads
  the `user` claim, makes one test call (the workouts of the last 30 days, at most 100, through the
  call limiter, without retries, within 15 s; a failure there, for example a 403, is saved as
  `lastCheck.error` and the connection is still saved), saves the encrypted settings, and
  redirects to `/account?m=connected` (or `?m=checkfailed`) or back to the pending consent page
  (`next`). When the new connection is for another Suunto username than the saved one, the
  previous connection is deauthorized at Suunto (best effort, after the new one is saved). Not for
  the same username: Suunto's deauthorize would end the new connection too.
  Errors (denied, bad or expired state, token exchange failed) redirect to `/account` with a flash
  code; no Suunto text is put in URLs. A demo account cannot connect Suunto.
- **Stored** (encrypted with the SecretBox, AAD = user id): `SuuntoAccountSettings { username,
  refreshToken, accessToken?, accessTokenExpiresAt?, clientId, units, readOnly, timeZone?,
  connectedAt }`. `timeZone` (IANA) becomes `SUUNTO_TIMEZONE` of the user's services; it is the
  browser's zone on the first connection (hidden field), then the user's choice; without it the
  admin page's default. Shows the connection (Suunto username, connected since, workouts in the last
  30 days or why unknown), "Reconnect" (runs the OAuth flow again; see the callback for the
  deauthorize of a replaced account) and "Remove" (deauthorize at Suunto, best effort, then
  delete). Without operator keys a stored connection is kept and shown as "not available right
  now"; the pool gives it no services, and Remove or deleting the account cannot tell Suunto (the
  confirm texts say so).
- **Token state**: a refresh that returns new tokens is saved with
  `store.saveSuuntoTokens(userId, ...)` without changing `service_updated_at` (so the service pool
  is not rebuilt). A refresh refused with `invalid_grant` marks the connection `needsReconnect`;
  tools then answer "Your Suunto connection expired. Connect Suunto again at <PUBLIC_URL>/account".
- **No Suunto calls on page views.** The account page shows what was saved at connect time
  (`SuuntoAccountSettings.lastCheck`: when, and the workouts counted in the last 30 days, or the
  error); it never calls Suunto just to show the page.
- **DB**: one fresh initial schema (no migrations): column `service_enc`, `service_updated_at`,
  `suunto_needs_reconnect`, table `suunto_oauth_states`, and the template's other tables.
- **Admin page**: as in PADI (no service checkboxes); user list column "Suunto" (connected / not /
  needs reconnect / sample data); overview counts connected users; a "Suunto API" card that says
  whether the three keys are set (never shows them), and shows the redirect URI to register in
  the Suunto API Zone, the Suunto servers (default or the operator's overrides) and the call
  limits in use (`ServicePool.limits`, section 4).
- **Access-request e-mails**: as in PADI (optional operator `SMTP_URL`, `NOTIFY_FROM`, TLS required).
- **Consent page**: the permission lines say what the AI app can do: read workouts, daily activity,
  heart rate, sleep, recovery, routes and points of interest; unless read-only, add routes and
  points of interest to the Suunto App.
- **Start page, legal pages, connect page**: rewritten for Suunto. No video. The privacy page says
  what is stored (e-mail, password hash, Suunto username and encrypted tokens, activity log of
  tool names and times), that workout and health data are fetched on demand and not stored, and
  that it passes through to the AI app the user connects. The terms say: unofficial, not medical
  advice, not for navigation or safety decisions.
- **Demo accounts**: in-memory data for "Alex Demo" (Suunto username `alexdemo`), time zone
  Europe/Zurich, metric: about 120 days of invented workouts (running, trail running, cycling,
  hiking, open water and pool swimming, scuba diving, strength training, cross-country skiing in
  winter), nightly sleep, daily steps and energy, 24/7 samples every 10 minutes (generated on
  demand from a seeded generator, not stored), recovery every 30 minutes, 4 routes and 5 POIs at
  invented places. Reset daily at 04:00 Europe/Zurich; routes and POIs added by tools live until
  the reset. Nothing leaves the server.

## 9. Safety rules

- Never log tokens, the client secret, the subscription key or e-mail addresses. `redact()` masks
  JWT-looking strings, `Bearer ...` and `Basic ...` values and the configured secrets.
- The OAuth `state` binds the callback to the user who started it; the code is exchanged once.
- Read-only accounts get no write tools at all (template behaviour).
- Outbound hosts are fixed by the operator; users cannot point the server anywhere.
- GPX input is parsed only to check it (size, root element, point count); it is sent to Suunto as
  it is. No XML entity expansion: reject `<!DOCTYPE` and `<!ENTITY`.
- Test data never contains real people's data.

## 10. Tests

Unit tests with a mocked `fetch` for `suunto/*` (authorize URL, code exchange, refresh, rotation,
single-flight, 401 retry once, invalid_grant marks reconnect, 403/404/429 mapping, Retry-After,
no retry of writes, deauthorize), `activity/*` (units, formatting of each wire type, 28-day
chunking, date and time zone handling with DST, aggregation, stats, sport filter, downsampling,
GPX checks), MCP surface tests (tool list, annotations, read-only hiding, strict args, redaction),
demo tests, and the template's web tests adapted (account connect flow with a mock Suunto OAuth
server: state checks, wrong user, expired state, denied, reconnect, remove with deauthorize).
Integration tests (`SUUNTO_MCP_IT=1`) start the real server against an in-process mock Suunto API
(OAuth + data). Commands: `npm run typecheck`, `npm run build`, `npm test`.

## 11. Module interfaces

The signatures modules use from each other. Keep them exactly, so modules written at the same
time fit together. More exports are fine.

```ts
// src/suunto/endpoints.ts
export interface SuuntoEndpoints { oauthUrl: string; apiUrl: string }        // no trailing slash
export const DEFAULT_ENDPOINTS: SuuntoEndpoints;                             // cloudapi-oauth / cloudapi
export function endpointsFromEnv(env: Record<string, string | undefined>): SuuntoEndpoints; // SUUNTO_OAUTH_URL, SUUNTO_API_URL (https, or http on a loopback host)
export function customEndpoints(e: SuuntoEndpoints): string[];               // names of the overridden ones
export function endpointEnv(env: Record<string, string | undefined>): Record<string, string>; // the override variables that are set

// src/suunto/oauth.ts
export interface SuuntoAppKeys { clientId: string; clientSecret: string; subscriptionKey: string }
export interface StoredSuuntoTokens { refreshToken: string; accessToken?: string; accessTokenExpiresAt?: number; clientId: string }
export type SuuntoAuthErrorCode = "invalid_grant" | "denied" | "bad_client" | "network" | "unknown";
export class SuuntoAuthError extends UserFacingError { readonly code: SuuntoAuthErrorCode; readonly status?: number }
export interface OAuthOptions { endpoints: SuuntoEndpoints; keys: Pick<SuuntoAppKeys, "clientId" | "clientSecret">; fetch?: typeof fetch; timeoutMs?: number; now?: () => number }
export interface TokenResult { tokens: Required<Pick<StoredSuuntoTokens, "accessToken" | "accessTokenExpiresAt">> & StoredSuuntoTokens; username: string; scope?: string }
export function authorizeUrl(endpoints: SuuntoEndpoints, clientId: string, redirectUri: string, state: string): string;
export function exchangeCode(code: string, redirectUri: string, opts: OAuthOptions): Promise<TokenResult>;
export type RefreshResult = Omit<TokenResult, "username"> & { username?: string };   // a refresh answer may not carry the username
export function refreshTokens(refreshToken: string, opts: OAuthOptions): Promise<RefreshResult>;
export function deauthorize(accessToken: string, opts: OAuthOptions): Promise<void>;

// src/suunto/session.ts
export interface TokenSink {
  save(tokens: StoredSuuntoTokens): void;
  invalid(reason: string): void;
  load?(): StoredSuuntoTokens | undefined;      // the tokens stored now (maybe newer); cheap, a throw counts as undefined
}
export interface SuuntoSessionOptions { tokens: StoredSuuntoTokens; keys: SuuntoAppKeys; endpoints: SuuntoEndpoints; sink?: TokenSink; fetch?: typeof fetch; timeoutMs?: number; now?: () => number; connectAgain?: string; backoffMs?: number; invalidGrantCooldownMs?: number }
export class SuuntoSession {
  constructor(opts: SuuntoSessionOptions);
  readonly connectAgain: string;                  // "Connect Suunto again." or the caller's sentence
  accessToken(): Promise<string>;                 // refreshes first when needed
  refreshNow(staleToken?: string): Promise<string>;
  username(): Promise<string>;                    // the `user` claim (refreshes first if no access token)
  get tokenExpiresAt(): number | undefined;
  get storedTokens(): StoredSuuntoTokens;
  get expired(): boolean;                         // Suunto's last answer to the refresh token was invalid_grant
  deauthorize(): Promise<void>;                   // best effort; never throws
}

// src/suunto/limiter.ts (section 4, call limiter)
export interface CallLimits { perMinute: number; perUserPerDay: number }       // 0 = no limit
export const DEFAULT_LIMITS: CallLimits;                                      // { perMinute: 10, perUserPerDay: 0 }
export interface CallLimiterOptions { perMinute: number; perKeyPerDay?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number }
export class CallLimiter {
  constructor(opts: CallLimiterOptions);
  acquire(key: string): Promise<void>;            // waits for a slot (up to maxWaitMs, default 45 s) or throws SuuntoHttpError kind "rate_limit"
}

// src/suunto/api.ts
export interface SuuntoApiOptions { session: SuuntoSession; keys: SuuntoAppKeys; endpoints: SuuntoEndpoints; fetch?: typeof fetch; log?: (m: string) => void; timeoutMs?: number; backoffMs?: number; sleep?: (ms: number) => Promise<void>; limiter?: CallLimiter; limiterKey?: string }
export class SuuntoApi implements ActivityBackend {
  constructor(opts: SuuntoApiOptions);
}

// src/suunto/activities.ts
export function activityName(id: number | null | undefined): string;          // "Running", or "Activity 999"
export function activityIdsFor(nameOrAlias: string): number[];                // [] when unknown (case-insensitive; aliases: run, bike, ride, swim, ski, hike, walk, dive, gym, ...)
export const ACTIVITIES: ReadonlyArray<{ id: number; name: string }>;
export const POI_TYPES: ReadonlyArray<{ id: number; name: string }>;          // PoiType from suunto-api.md
export function poiTypeName(id: number): string;
export function poiTypeId(name: string): number | undefined;                  // case-insensitive

// src/activity/service.ts
export interface ServiceOptions { readOnly: boolean; units: UnitChoice; timeZone: string; now?: () => number }
export class ReadOnlyError extends UserFacingError {}
export class ActivityService {
  constructor(backend: ActivityBackend, opts: ServiceOptions);
  readonly backend: ActivityBackend;
  account(): Promise<SuuntoAccount>;
  check(): Promise<{ ok: boolean; error?: string; workouts_last_30_days?: number }>;
  // plus one method per tool (DESIGN section 6), taking the tool's parsed arguments
}

// src/activity/tools.ts
export function registerActivityTools(ctx: ToolContext, service: ActivityService): void;   // every tool of section 6 except suunto_account_info

// src/demo/activity.ts and src/demo/index.ts
export class DemoActivityStore { constructor(opts?: { now?: () => number; timeZone?: string }) }
export class DemoActivityBackend implements ActivityBackend { constructor(store: DemoActivityStore) }
export const DEMO_ADDRESS: string;        // "alex.demo@example.com"
export const DEMO_USERNAME: string;       // "alexdemo"
export const DEMO_TIME_ZONE: string;      // "Europe/Zurich"
export interface DemoAccount { generation: number; activity: DemoActivityStore }
export class DemoRegistry { account(userId: string): DemoAccount; reset(userId?: string): void; /* + the template's daily reset timer */ }
export const demoRegistry: DemoRegistry;

// src/config.ts
export interface SuuntoSettings {
  keys?: SuuntoAppKeys;                   // always set by loadConfig (single-user needs them)
  refreshToken?: string;
  tokenCache?: string;
  redirectUri: string;                    // --login only
  endpoints: SuuntoEndpoints;
}
export interface AppConfig { suunto: SuuntoSettings; units: UnitChoice; readOnly: boolean; timeZone: string; transport: "stdio" | "http"; http: HttpSettings; secrets: string[]; callLimits?: CallLimits }
export function loadConfig(env?: Record<string, string | undefined>, cli?: CliOverrides, warn?: (m: string) => void): AppConfig;
export function loadLoginConfig(env?: Record<string, string | undefined>, warn?: (m: string) => void): AppConfig;   // --login: keys and SUUNTO_TOKEN_CACHE, no sign-in yet
export function callLimitsFromEnv(env: Record<string, string | undefined>, defaults?: Partial<CallLimits>): CallLimits;  // empty = default; throws ConfigError for a bad value
export function expandPath(path: string): string;                             // "~" and "~/..." in the home folder, made absolute
export function inspectTokenCache(file: string, clientId?: string): { tokens: StoredSuuntoTokens } | { problem: string; missing: boolean };  // never throws
export function suuntoKeysFromEnv(env: Record<string, string | undefined>): SuuntoAppKeys | undefined;  // undefined unless all three are set; throws ConfigError when only some are
export function describeConfig(config: AppConfig): Record<string, unknown>;    // no secrets

// src/activity/cache.ts (section 4, rate limits)
export class CachedBackend implements ActivityBackend { constructor(inner: ActivityBackend, opts?: { now?: () => number; maxEntries?: number; maxBytes?: number }) }

// src/server.ts
export interface Services { activity?: ActivityService; backend?: ActivityBackend; session?: SuuntoSession; reused: boolean }
export interface CreateServicesOptions {
  demo?: DemoActivityStore;               // demo account: no connection to Suunto, ever
  tokens?: StoredSuuntoTokens;            // the web store's tokens (win over config and cache)
  tokenSink?: TokenSink;                  // where new tokens are saved (web store); default fileTokenSink(SUUNTO_TOKEN_CACHE) or memory
  connectAgain?: string;                  // the sentence after "Your Suunto connection expired."
  cache?: boolean;                        // default true (CachedBackend)
  fetch?: typeof fetch;
  log?: (m: string) => void;
  limiter?: CallLimiter;                  // the web service's one limiter; default one per process from config.callLimits
  limiterKey?: string;                    // the user id (web); single-user mode uses one key for the process
  reuse?: { session: SuuntoSession; backend: ActivityBackend };   // same connection, new settings (web pool)
}
export function createServices(config: AppConfig, opts?: CreateServicesOptions): Services;   // { reused: false } when there is no refresh token
export function fileTokenSink(file: string, log: (m: string) => void, clientId?: string): TokenSink;   // load() reads the file again
export function closeServices(services: Services): Promise<void>;
export function createMcpServer(config: AppConfig, services: Services, log: (m: string) => void, hooks?: McpServerHooks): McpServer;
export const SERVER_TITLE: string;        // "MCP for Suunto (workouts, sleep, recovery)"
export const SERVER_DESCRIPTION: string;
export function buildInstructions(config: AppConfig): string;

// src/web/server.ts and src/web/accounts.ts (section 8)
export const WEB_DEFAULT_LIMITS: CallLimits;                                  // { perMinute: 10, perUserPerDay: 100 }
export function suuntoRedirectUri(publicUrl: URL, configured: string | undefined): string;   // throws ConfigError (section 8)
export function isPublicHost(hostHeader: string | undefined, publicUrl: URL): boolean;
export const POOL_IDLE_MS: number;                                            // 35 minutes
// ServicePool keeps one Connection { connectedAt, session, backend } per user across rebuilds; get limiter(), get limits()

// src/web/store.ts (section 8)
export interface SuuntoAccountSettings { username: string; refreshToken: string; accessToken?: string; accessTokenExpiresAt?: number; clientId: string; units: UnitChoice; readOnly: boolean; timeZone?: string; connectedAt: number; lastCheck?: { at: number; workouts?: number; error?: string } }
// User gets: hasSuunto: boolean; suuntoNeedsReconnect: boolean (instead of hasPadi / padiNeedsReconnect)
// Store gets: getSuuntoSettings, readSuuntoSettings, saveSuuntoSettings, saveSuuntoTokens(userId, tokens, connectedAt?),
//   saveSuuntoPreferences, setSuuntoNeedsReconnect, createOAuthState(userId, next?), consumeOAuthState(state, userId) -> { next? } | undefined
```
