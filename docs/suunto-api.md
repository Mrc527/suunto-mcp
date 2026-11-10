# The Suunto Cloud API (facts for MCP for Suunto)

MCP for Suunto reads a user's Suunto data through the **official Suunto Cloud API**, as an
accepted Suunto API partner. The user connects with OAuth 2 (authorization code flow), and the
server calls the API with the user's access token and the partner subscription key.

This page is the single source of facts the code is written against. It was put together on
2026-11-10 from the public Suunto API Zone at https://apizone.suunto.com (an Azure API Management
developer portal): the data of its 10 APIs (operations, JSON schemas, examples), its product list,
the pages `/how-to-start`, `/faq`, `/webhooks`, `/route-description`, `/fit-description`,
`/how-to-workout-upload`, `/suuntoplus-guide-description`, `/how-to-use-suuntoplus-guides-api`,
the home page `/`, and the linked PDFs `Activities.pdf` and `SuuntoplusGuideCloudAPI.pdf`. Every
Suunto fact below was checked again against these downloaded files on 2026-11-10.

Some facts come from outside Suunto: open source projects that already talk to the API, forum
posts, and the Azure API Management docs (section 9). That code was read only to learn facts. It is
not official, so those facts are never better than **likely**.

No call to `cloudapi.suunto.com` has been made yet. Labels used below:

- **documented**: Suunto states it in a page, an operation or a schema.
- **example only**: only an example value in the docs shows it.
- **likely**: not in the Suunto docs, but working third-party clients or forum posts show it, or
  the examples strongly point to it. The short source name is given (section 9).
- **unverified**: our reading of the docs, a single third-party report, or a guess. Check it with a
  real call.
- **not documented**: the docs say nothing about it. (All example values are from the Suunto docs.)

## Contents

1. [Overview](#1-overview)
2. [OAuth](#2-oauth)
3. [Data APIs](#3-data-apis)
4. [Webhooks](#4-webhooks)
5. [Workout extensions](#5-workout-extensions)
6. [Gotchas](#6-gotchas)
7. [Open questions](#7-open-questions)
8. [Appendix: activity ids](#8-appendix-activity-ids)
9. [Appendix: outside sources](#9-appendix-outside-sources)

---

## 1. Overview

### 1.1 Hosts and base URLs

| Host | Purpose |
| --- | --- |
| `cloudapi-oauth.suunto.com` | OAuth: `/oauth/authorize`, `/oauth/token`, `/oauth/deauthorize` |
| `cloudapi.suunto.com` | All data APIs |
| `apizone.suunto.com` | The developer portal (app settings, subscription keys, webhooks setup) |
| `cloudapi-partner.suunto.cn` | Appears once, in the route update description. The FAQ says there is a separate Chinese API ("technically the same, just with different address endpoints") given on request. |

The portal's OAuth API page shows `cloudapi.suunto.com` for the OAuth operations. Suunto says
this host is wrong: use `cloudapi-oauth.suunto.com` (documented).

| API (portal name) | Portal id | Base URL | Notes |
| --- | --- | --- | --- |
| SUUNTO AUTHORISATION API | `oauth2-api` | `https://cloudapi-oauth.suunto.com` | section 2 |
| SUUNTO 247 DATA API | `new-247-api` | `https://cloudapi.suunto.com/247samples` | activity samples, sleep, recovery, daily statistics |
| SUUNTO DAILY ACTIVITY API | `activity-and-sleep-data-api` | `https://cloudapi.suunto.com/247` | daily statistics only |
| SUUNTO WORKOUT API | `suunto-workout-api` | `https://cloudapi.suunto.com/v3/workouts` | current workout API |
| SUUNTO WORKOUT API (DEPRECATED) | `workout-api` | `https://cloudapi.suunto.com/v2` | "Deprecated. Use SUUNTO WORKOUT API instead." |
| SUUNTO WORKOUT DESCRIPTION API | `suunto-workout-description-api` | `https://cloudapi.suunto.com/v1/workouts` | add text to a workout description |
| SUUNTO ROUTE API | `route-api` | `https://cloudapi.suunto.com/v2/route` | GPX routes |
| SUUNTO POINT OF INTEREST API | `suunto-point-of-interest-api` | `https://cloudapi.suunto.com/v2/poi` | points of interest |
| SUUNTO UPLOAD API | `suunto-upload-api` | `https://cloudapi.suunto.com/v2/upload` | FIT upload |
| SUUNTO GUIDES API | `suunto-guides-api` | `https://cloudapi.suunto.com/v2/guides` | SuuntoPlus Guides |

### 1.2 Required headers on data calls

| Header | Value | Source |
| --- | --- | --- |
| `Authorization` | `Bearer <JWT access token>` | documented (FAQ: "Use the JWT tokens ... with a header in the following format: `Authorization: Bearer <jwt token>`") |
| `Ocp-Apim-Subscription-Key` | the partner's subscription key (primary or secondary) | documented |

- Many curl examples send `Authorization: <your access token>` without `Bearer`. Whether the raw
  token works too is **unverified**. Always send `Bearer`.
- Every API also accepts the key as query parameter `subscription-key` (API data). Use the header.
- No subscription key on OAuth calls (FAQ). Primary and secondary keys both work (documented).
  The portal data marks every API, the OAuth one included, as `subscriptionRequired`, but the FAQ
  and the how-to-start curl example send no key to `cloudapi-oauth.suunto.com`. Follow the FAQ.

### 1.3 Subscriptions and limits

| Product | Limits | Source |
| --- | --- | --- |
| Developer API (product id `starter`) | "Subscribers will be able to run 10 calls/minute up to a maximum of 200 calls/week." One subscription per account; no approval needed. | documented (portal product list) |
| Production API | **no numbers published**. Home page: "The Development API includes all the endpoints but has smaller request limits." FAQ: "When you are ready with your implementation, please subscribe to the Production API. We will then connect you for next steps." | home page, FAQ |

Also documented: 247 calls take at most **28 days** per request; the routes list: "We currently
do not impose any rate limits on the Routes Listing API but we **prohibit polling**"; 247 APIs can
answer **503** "Service capacity exceeded. Try again later."; the Developer API "has same
capabilities as the production API", only rate limited; the API is free ("We do not charge from
the use of the API", home page).

The 200 calls/week limit is per subscription key, so it is shared by **all users** of the server
(unverified, but the key is the only thing that identifies the app). A multi-user service needs
the Production API.

**When a limit is hit** (not documented by Suunto). The gateway is Azure API Management. Its
rate-limit policy answers **429** with a `Retry-After` header in seconds; its quota policy answers
**403** with `Retry-After` and a body like "Out of call volume quota. Quota will be replenished in
hh:mm:ss" (likely; Azure docs, open-health-sync). So 10 calls/minute most likely gives 429 and
200 calls/week gives 403. One third party also saw **401** with "RateLimitExceeded" in the body,
which cleared after about 90 seconds (unverified; googlarz). Rules for the code:

- Treat 429, 403 with a quota text, 401 with "RateLimitExceeded" and 503 as "slow down": wait
  (`Retry-After` when present) and do not touch the user's tokens.
- A 401 that mentions the subscription key (Azure's default text is "Access denied due to missing
  subscription key" or "... invalid subscription key") is a server configuration error, not an
  expired user token (likely; Azure API Management defaults).

### 1.4 FAQ points that matter for a multi-user server

- **One account, one app** ("One account is associated to one email address"). Test and
  production services need separate API Zone accounts.
- **Access is for organizations**, "we do not provide this for personal use". A person who runs
  their own copy of the server cannot simply get their own credentials.
- **Development uses the production system** and real user data: "you can use the real data from
  your testers with your app/service". No Suunto document says that the Developer API only lets
  the developer's own accounts authorize.
- **Going to production** (FAQ and home page): be accepted into the partner program and sign the
  API agreement; submit the app information in the API Zone profile; subscribe to the Production
  API; fill in the content submit form. Suunto then grants production access and publishes the app
  on suunto.com and in the Suunto App.
- **User mapping**: the access token JWT has a claim `user` with the Suunto username. Webhooks
  identify the user by this name.
- **Do not poll.** Use webhooks for new workouts. Fetch daily activity when a workout arrives,
  otherwise about once a day or on a user action ("synch" button). "Avoid unnecessary polling."
- **Load**: no status page; more load on weekends and at the start of the year.
- **Credentials**: users sign in with Suunto App credentials; Movescount ones give 401.
- **Publishing**: the app shows in the Suunto App once the Production subscription is accepted.
- **Personal data**: "weight data or heartrate zones are not available yet" (FAQ). No API
  operation returns them.
- **Outdated answers**: the FAQ says sleep data and points of interest are not available, and the
  route page says POIs "are not supported by the Suunto Cloud API". The API now has sleep (3.2)
  and POI (3.8) endpoints. Trust the API pages.
- **Activity ids**: workout JSON uses the **Suunto App activity ids** (section 8), not FIT ids.

### 1.5 Response envelope and errors

Two styles exist:

- **Envelope** (workouts v2 and v3, guides): `{"error": null | {"code": "...", "description": "..."}, "payload": ..., "metadata": {"<key>": "<string>"}}`.
  Schema name `STTResponse`. Metadata values are **strings**.
- **Plain JSON** (247 data, routes, POI, upload): the payload itself.

Status codes named in the docs:

| Code | Where | Meaning (documented) |
| --- | --- | --- |
| 400 | all, OAuth token and deauthorize too | bad request; 247: "Something is wrong with the parameters." |
| 401 | 247, routes, OAuth | "Authentication failed." FAQ: "bad client credentials" with wrong credentials |
| 403 | workouts, workout description, routes, POI, upload, guides | forbidden (no text for most). Also, likely, the Azure quota answer (1.3) |
| 404 | FIT export, routes, POI get, upload status, guides | not found |
| 409 | route update, guide create/update | revision conflict; duplicate guide `externalId` |
| 422 | upload | "On wrong parameters (e.g. unsupported data type)" |
| 429 | none | not in the docs. Likely the Azure rate-limit answer (1.3) |
| 500 | many | FAQ: a 500 "internal server error" from the workout API often means a wrong workout key. Workout key format: "hexadecimal string, key length - 12 bytes" (24 hex characters). |
| 503 | 247 | "Service capacity exceeded. Try again later." |

Error bodies for 400, 401 and 403 are **not documented** except in the guides API.

---

## 2. OAuth

### 2.1 App setup (documented)

In the API Zone profile, OAuth settings: set at least **App name**, **Client secret** and
**Redirect URI**. The **Client Id** is generated. The same settings page holds the webhook
notification URLs and the notification secret (section 4). The OAuth "App name" must equal the
`owner` field of SuuntoPlus guides (section 3.10).

### 2.2 Authorize

```
GET https://cloudapi-oauth.suunto.com/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>
```

| Parameter | Required | Notes |
| --- | --- | --- |
| `response_type` | yes | only value `code` (documented) |
| `client_id` | yes | the app's client id (documented) |
| `redirect_uri` | yes | the redirect URI from the app settings (documented). Exact matching rules: not documented |
| `state` | ? | **not documented**. Several working clients send it and reject the callback when it does not match, so Suunto passes it back (likely; googlarz, open-wearables, quantified-self). |
| `scope` | ? | **not documented** as an input. Some clients send `scope=workout`, others send nothing. Users report that the consent screen has only an "Authorize" button with no permission choices, and that re-authorizing still gives the `workout` scope (unverified that the input has any effect; quantified-self, intervals.icu forum). |
| `code_challenge` (PKCE) | ? | **not documented**. One client sends it; support is unverified. Do not depend on it. |

- The user signs in with Suunto App credentials and allows access in a browser (documented;
  "optimized for mobile use"). On success the browser goes to `<REDIRECT_URI>?code=<code>`, for
  example `https://www.example.com/oauth-redirect?code=G5ahWs` (documented).
- What the redirect carries when the user refuses or on an error: **not documented**. Production
  clients treat an `error` query parameter on the redirect as a denial (likely; c2c_tracking,
  CubeTrek). The exact value `access_denied` is unverified; it is what Spring Security OAuth2
  sends, and the server texts in 2.3 look like Spring Security OAuth2.

### 2.3 Token (authorization code)

```
POST https://cloudapi-oauth.suunto.com/oauth/token
Authorization: Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)
```

| Parameter | Value |
| --- | --- |
| `grant_type` | `authorization_code` (or `refresh_token`, section 2.4) |
| `code` | the code from the redirect |
| `redirect_uri` | "same redirect URI as used for /authorize endpoint request" |

- Basic auth as in RFC 7617 (documented). FAQ example: client id
  `a992f660-c50d-4bf7-905c-e706e42c9e9d`, secret `EDks3wJPnK6W`, header
  `Authorization: Basic YTk5MmY2NjAtYzUwZC00YmY3LTkwNWMtZTcwNmU0MmM5ZTlkOkVEa3Mzd0pQbks2Vw==`.
- **Where the parameters go**: the operation page puts them in the **query string**
  (`/oauth/token?grant_type=authorization_code&code=...`); the how-to-start page sends a **form
  body** (`curl --user <CLIENT_ID>:<CLIENT_SECRET> -d grant_type=authorization_code -d redirect_uri=... -d code=...`).
  Both are documented. Working clients use both: CubeTrek, googlarz and quantified-self send a
  form body, c2c_tracking sends the query string with an empty body (likely). Use the form body
  (`application/x-www-form-urlencoded`, the OAuth standard).
- No subscription key (FAQ).

Answer (documented, how-to-start):

```json
{
  "access_token": "<JWT_TOKEN>",
  "token_type": "bearer",
  "refresh_token": "<JWT_REFRESH_TOKEN>",
  "expires_in": 86400,
  "scope": "workout"
}
```

| Field | Notes |
| --- | --- |
| `access_token` | a JWT. Its `exp` claim is the expiry in seconds since the Unix epoch (documented: "Token expiration time (seconds since Unix epoch) is in the "exp" token attribute"). |
| `token_type` | `bearer` |
| `refresh_token` | named `<JWT_REFRESH_TOKEN>`, and the 200 answer is "JWT token (access and refresh)", so the refresh token is a JWT too (documented). Its lifetime: **not documented**. |
| `expires_in` | seconds. `86400` (24 h) in the example only. Use `exp` or `expires_in`, whichever is present. |
| `scope` | `"workout"` in the example. Third-party clients always see `workout` (likely). Other values: not documented. |
| `user` | the webhooks page says the Suunto user id is "the `user` field in the OAuth access token response" (documented there), but the how-to-start example does not show it. Third-party clients read it from the `authorization_code` answer (likely; c2c_tracking, open-wearables). A refresh answer may not have it (likely). Use the JWT `user` claim (2.5) as the main source. |

Errors:

- Wrong client credentials: **401** with the message "bad client credentials" (FAQ). The FAQ
  says the usual causes are a wrong `Authorization` header, or users who sign in with Movescount
  credentials instead of Suunto App ones.
- Bad, used or expired code, and a bad refresh token: **400** with a JSON body like
  `{"error": "invalid_grant", "error_description": "Invalid authorization code: ..."}` (likely;
  quantified-self). The operation lists 400 without a body.

### 2.4 Refresh

```
POST https://cloudapi-oauth.suunto.com/oauth/token?grant_type=refresh_token&refresh_token=<refresh_token>
Authorization: Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)
```

- Documented as "Refresh access token". Only `authorization_code` is said to give "New access
  and refresh tokens". Whether a refresh returns a new refresh token, and whether the old one
  then stops working: **not documented**.
- A refresh answer contains a `refresh_token`; one production client requires the field (likely;
  c2c_tracking). One third party says Suunto invalidates the old refresh token after its first
  use, so two refreshes at the same time log the user out (unverified; googlarz). Other clients
  keep the old token when no new one comes back.
- Rules: always store the newest `refresh_token` from every answer; run only one refresh per user
  at a time.
- Refresh token lifetime: **not documented**. The refresh token is a JWT, so it may have `exp`
  (unverified). Read it if present.
- Form body versus query string: as in 2.3; use the form body.
- **Do not delete stored tokens on the first `invalid_grant`.** During an outage in July 2026,
  Suunto answered refreshes with false 400 `invalid_grant` errors and later accepted the same
  refresh token again (likely; quantified-self). Keep the tokens, retry later, and ask the user to
  reconnect only after repeated failures.

### 2.5 Access token claims

| Claim | Notes |
| --- | --- |
| `user` | custom claim, "the authorizing user's Suunto app account username" (documented). Use it as the stable user id and to match webhooks (`username`). |
| `exp` | expiry, seconds since the epoch (documented) |
| others | not documented. Third parties see `sub`, `jti`, `uk` and `ukv` (likely; c2c_tracking, open-wearables). Do not depend on them. |

Read the claims without checking the signature only to get `user` and `exp`: the token comes
straight from Suunto's token endpoint over TLS. The signing key is not documented.

### 2.6 Deauthorize

```
GET https://cloudapi-oauth.suunto.com/oauth/deauthorize?client_id=<CLIENT_ID>
Authorization: Bearer <access token>
```

- "Disconnect user from partner service" (documented). 200 with an empty body on success; 400 on
  error.
- Call it when a user disconnects Suunto in our app. What happens to the access and refresh tokens
  and to webhooks afterwards, and whether Suunto tells us when the user disconnects on the Suunto
  side: **not documented**.
- Suunto App side (likely; Suunto forum posts 53397, 60250 and 123407, not official docs): the
  app lists connected partner services. Suunto staff say the partner must call deauthorize, or the
  app keeps showing the service as connected. Only some partners (for example Strava and
  TrainingPeaks, which Suunto manages itself) could be disconnected inside the app; staff said
  they understood the need for a Suunto-side button. Some users now report a disconnect button at
  the bottom of a connected service's screen, others could not find it.
- A partner app is shown in the Suunto App only after Suunto accepts its Production subscription
  (FAQ).

---

## 3. Data APIs

All calls below need the two headers of section 1.2. Paths are relative to the base URLs of 1.1.

### 3.1 Time formats at a glance

| API | Input | Output |
| --- | --- | --- |
| 247 activity, sleep, recovery | `from`, `to`: epoch **milliseconds** | `timestamp`: ISO 8601 string with `Z` or an offset |
| 247 and daily activity statistics | `startdate`, `enddate`: ISO 8601 strings | `TimeISO8601`: ISO 8601 string |
| Workouts list | `since`, `until`: epoch **milliseconds** | `startTime`, `stopTime`: epoch milliseconds; `timeOffsetInMinutes` |
| Routes | `since`: epoch milliseconds | `created`, `modified`: epoch milliseconds (example only) |
| POI | none | `creation`, `modified`: unit not documented; the example `1602074065` is in **seconds** |
| Guides | `fileSince`: epoch milliseconds | `modificationTime`, `fileModificationTime`: epoch milliseconds; `localDate`: `yyyy-MM-dd` |

### 3.2 SUUNTO 247 DATA API (`/247samples`)

Common rules (documented for all four operations):

- "Data is stored into and fetched from the API using UTC time."
- Maximum interval **28 days**. Suunto advises fetching once every 24 hours.
- Headers: `Authorization` ("JWT access token"). The activity, sleep and recovery operations also
  list a required `Content-Type: application/json` header, although they are GETs. Send it.
- Errors: 400, 401, 500, 503 (section 1.5).
- Returned timestamps are ISO 8601 with the wearer's local offset (for example `+02:00` in the
  webhook examples); the doc examples also use `Z`.

Other notes:

- The documented example call `/247samples/activity?from=1672524000000&to=1690837200000` spans
  212 days. Follow the 28-day rule, not the example. One third party says a window of exactly 28
  days is rejected on daily statistics (unverified). Stay below 28 days.
- `from` and `to` (activity, sleep, recovery) must be epoch-ms **integers** (documented type).
  ISO strings give 400 "Type mismatch" (unverified; jb381). They are UTC instants and the window
  filters on instants, so a window that starts at UTC midnight cuts a local day at the UTC offset,
  for example at 02:00 for a user at UTC+2 (likely; googlarz). Build windows from the user's local
  midnight.
- Subscriptions: one third party says sleep, recovery and activity may need extra API Zone
  subscriptions, and that recovery may answer 404 without one (unverified; googlarz). The home
  page says the Development API "includes all the endpoints".

#### GET `/247samples/activity?from={from}&to={to}`

"Daily steps, energy consumption (in joules), HR data and SpO2 based on sample values from the
watches." `from` and `to`: integers, epoch milliseconds, both required. Example call:
`/247samples/activity?from=1672524000000&to=1690837200000`.

Answer (`DailyActivityEntryDataArray`, documented example):

```json
[{"timestamp": "2019-02-11T12:00:00Z",
  "entryData": {"HR": 72, "StepCount": 100, "EnergyConsumption": 8000, "SpO2": 0.5,
                "Altitude": 50, "HRExt": {"Min": 60, "Max": 80}, "HRV": 12}},
 {"timestamp": "2019-02-11T12:10:00Z", "entryData": {"HR": 65, "StepCount": 50, "...": "..."}}]
```

| Field | Type | Unit and notes (schema) |
| --- | --- | --- |
| `timestamp` | string | ISO 8601 "having also the local time offset from UTC (`yyyy-MM-ddTHH:mm:ss.fffzzz`)". Examples: `2019-02-11T12:00:00Z`, `2024-12-10T14:50:00.000+02:00` (webhook). |
| `HR` | float | average heart rate, bpm |
| `StepCount` | int | schema: "Accumulated steps". Most likely the steps of the sample period (likely): the example (100, then 50) is not a running day total, and an older, unused schema definition in the same API (`DailyActivitySample`) says "steps recorded since previous measurement". |
| `EnergyConsumption` | float | **joules** (per sample period, same remark as `StepCount`; the old definition says "energy consumption (in joules) since previous measurement value") |
| `SpO2` | float | oxygen saturation as a **fraction 0..1** |
| `Altitude` | float | metres |
| `HRExt` | object | `{"Min": float, "Max": float}`, bpm |
| `HRV` | int | ms |

Every field may be missing in a sample (unverified; webhook samples carry only `HR`,
`StepCount`, `EnergyConsumption`). The sample interval is not documented. It is most likely **10
minutes**: the doc and webhook examples are 10 minutes apart, and a live observer counts 144
rows per day (likely).

#### GET `/247samples/sleep?from={from}&to={to}`

`from`, `to`: epoch milliseconds, required. Answer `SleepEntryArray`: a list of
`{"timestamp": "2021-01-24T21:54:52.217Z", "entryData": {...}}`, one per sleep segment. The
documented example has every field below, with `Duration` 28126, `DeepSleepDuration` 4225,
`Feeling` 3, `MaxSpo2` 0.5, `IsNap` false and `SleepId` null.

| Field | Type | Unit and notes (schema) |
| --- | --- | --- |
| `DeepSleepDuration`, `LightSleepDuration`, `REMSleepDuration` | float | **seconds** |
| `Duration` | float | seconds. "Contains also awake time in Gomore algorithm." |
| `Feeling` | int | Poor (1), Average (2), Good (3), Very Good (4), Excellent (5) |
| `HRAvg`, `HRMin` | float | bpm |
| `SleepQualityScore` | int | 0..100 |
| `BodyResourcesInsightId`, `SleepId` | int, int64 | "TODO" in the schema; may be null. Webhook `SleepId` example: `1736112540`. |
| `BedtimeStart`, `BedtimeEnd` | string | ISO 8601 |
| `MaxSpo2`, `Altitude` | float | fraction 0..1; metres |
| `AvgHRV`, `AvgHRVSampleCount` | float, int | ms, average during the segment; number of HRV samples behind it |
| `IsNap` | bool | segment is a nap (Gomore algorithm) |
| `SleepOnsetLatencyDuration` | float | seconds awake before sleep onset (SOL) |
| `WakeAfterSleepOnsetDuration` | float | seconds awake between onset and offset (WASO) |
| `WakeBeforeOffBedDuration` | float | seconds awake after offset, before off bed (WBO) |
| `DateTime` | string | "Entry date in ISO8601 format" |

Which day a sleep belongs to (start date, end date, local or UTC) is not documented. The
`timestamp` and `BedtimeStart` are equal in all examples.

#### GET `/247samples/recovery?from={from}&to={to}`

`from`, `to`: epoch milliseconds, required. Answer `RecoveryEntryArray` (documented example):

```json
[{"timestamp": "2025-01-05T16:00:00Z", "entryData": {"Balance": 0.82, "StressState": 2}},
 {"timestamp": "2025-01-05T17:00:00Z", "entryData": {"Balance": 0.85, "StressState": 1}}]
```

| Field | Type | Notes (schema) |
| --- | --- | --- |
| `Balance` | float | "Body's energy level between 0.0 and 1.0". It matches the Suunto App "Resources" percent (0.96 = 96%) (likely; googlarz). |
| `StressState` | int | Invalid (0), Relaxing (1), Active (2), Passive (3), Stressful (4) |

The sample interval is not documented. The doc example is hourly, but a live observer counts 48
rows per day, so most likely **30 minutes** (likely).

#### GET `/247samples/daily-activity-statistics?startdate={startdate}&enddate={enddate}`

"Aggregated daily steps and energy consumption (in joules)." `startdate`, `enddate`: ISO 8601
strings, required. Documented sample call:
`/daily-activity-statistics?startdate=2019-02-11T02:00:00&enddate=2019-02-20T01:59:59`.
Answer `AggregatedActivityDataArray` (documented example):

```json
[
  {"Name": "energyconsumption", "Aggregation": "sum",
   "Sources": [{"Name": "suunto-247-3e0f7c17-2775-477a-a12f-a50ff0170860",
                "Samples": [{"TimeISO8601": "2019-02-11T02:00:00.000", "Value": null},
                            {"TimeISO8601": "2019-02-12T02:00:00.000", "Value": 640580.3985}]}]},
  {"Name": "stepcount", "Aggregation": "sum", "Sources": ["... same shape, Value 4617 ..."]}
]
```

| Field | Notes (schema) |
| --- | --- |
| `Name` (top) | `energyconsumption` or `stepcount` |
| `Aggregation` | "Currently sum or avg." |
| `Sources[].Name` | "Unique data source (i.e. watch) identifier" |
| `Samples[].Value` | daily steps or energy in **joules**. Schema type is string; examples are numbers or `null`. "Can be null if no data or 2 records returned for specified date (one null and one not null)." Accept number, numeric string and null. |
| `Samples[].TimeISO8601` | schema: ISO 8601 with offset (`yyyy-MM-ddTHH:mm:ss.fffzzz`); the example has no offset |

How the day boundaries are chosen: **not documented**, and the evidence conflicts (unverified).
The doc example asks from 02:00 and gets samples stamped 02:00, which suggests the buckets follow
`startdate`. One live observer says each daily sample is stamped at local noon (for example
`2026-09-27T12:00:00+02:00`) and that a one-day window returned two days. Rules: pick days by the
date part of `TimeISO8601`, and merge the null and non-null records of one date.

Offsets in `startdate`/`enddate` must be written like `+02:00`; `+0200` gives 400 (unverified;
googlarz). The documented example has no offset at all.

### 3.3 SUUNTO DAILY ACTIVITY API (`/247`)

One operation, `GET https://cloudapi.suunto.com/247/daily-activity-statistics?startdate={startdate}&enddate={enddate}`,
with the same parameters, rules (UTC, 28 days, once a day), answer and errors as
`/247samples/daily-activity-statistics`. Whether the two return the same data, and which one
Suunto prefers, is **not documented**. Prefer `/247samples`.

### 3.4 SUUNTO WORKOUT API v3 (`/v3/workouts`)

#### GET `/v3/workouts` (list)

"Get list of workouts for the authenticated user."

| Query parameter | Type | Default | Notes (documented) |
| --- | --- | --- | --- |
| `since` | int, epoch ms | `0` | minimum timestamp, **inclusive** |
| `until` | int, epoch ms | now | maximum timestamp, **exclusive** |
| `limit` | int | `50` | maximum number of workouts. Server maximum: not documented; clients use 50, 100 and 1000. A page shorter than `limit` is the last page. |
| `offset` | int | `0` | workouts to skip |
| `filter-by-modification-time` | bool | `true` | `true`: `since`/`until` filter on **modification time**; `false`: on **workout start time** |

Example call (documented): `/v3/workouts?since=1709251200000&until=1711929600000&limit=10&offset=0`
"would return list of 10 last modified workouts between 2024-03-01T00:00:00Z and
2024-04-01T00:00:00Z". The sort order is **not documented** ("10 last modified" hints at newest
first; unverified).

Answer: envelope with `payload` = list of workouts (section 3.4.3) and `metadata`. Documented
example (shortened; the original text is not valid JSON, it starts with `[{{`):

```json
{"error": null,
 "payload": [{"activityId": 11, "startTime": 1526196562327, "totalTime": 2686.03,
   "totalDistance": 3900.0, "totalAscent": 88.75, "totalDescent": 128.52,
   "startPosition": {"x": 23.842736666666667, "y": 61.453113333333334},
   "stopPosition": {"x": 23.844015, "y": 61.45330166666667}, "centerPosition": {"...": "..."},
   "maxSpeed": 2.6, "recoveryTime": 0, "cumulativeRecoveryTime": 0,
   "rankings": {"totalTimeOnRouteRanking": {"originalRanking": 1, "originalNumberOfWorkouts": 1}},
   "extensions": [{"type": "SummaryExtension", "...": "see section 5.1"}],
   "extensionTypes": ["DISTANCEDELTA", "ALTITUDESTREAM", "LOCATIONSTREAM", "EPOCSTREAM", "SUMMARY",
     "SPEEDSTREAM", "HEARTRATESTREAM", "VERTICALSPEEDSTREAM", "SEALEVELPRESSURESTREAM",
     "CADENCESTREAM", "INTENSITY"],
   "minAltitude": 128.2, "maxAltitude": 173.6, "workoutKey": "5b190f5c52ce7b316acbd520",
   "avgPace": 11.48, "commentCount": 0, "pictureCount": 0, "viewCount": 0,
   "cadence": {"max": 0, "avg": 0},
   "hrdata": {"userMaxHR": 0, "workoutMaxHR": 145, "workoutAvgHR": 114, "hrmax": 145, "max": 0, "avg": 114},
   "avgSpeed": 1.45, "energyConsumption": 360}],
 "metadata": {"workoutcount": "1", "until": "1535093315408"}}
```

- `metadata.workoutcount`: the number of workouts in this answer or in total: **not documented**.
  `metadata.until`: meaning not documented. Both are strings.
- Errors: 400, 403.

#### GET `/v3/workouts/{workoutKey}` (one workout)

| Parameter | Notes (documented) |
| --- | --- |
| `workoutKey` (path) | the workout key (24 hex characters, see FAQ in 1.5) |
| `extensions` (query) | comma-separated extension names to include in the `extensions` array, for example `SummaryExtension,WeatherExtension` |

Possible `extensions` values (documented, exact spelling):

```
AltitudeStreamExtension, BatteryLevelStreamExtension, CadenceStreamExtension, DepthStreamExtension,
DistanceDeltaStreamExtension, DistanceLapExtension, DiveHeaderExtension, DurationLapExtension,
EnergyConsumptionStreamExtension, EpocStreamExtension, FitnessExtension, HeartRateExtension,
HeartrateStreamExtension, IBIStreamExtension, IntensityExtension, IntervalStreamExtension,
LocationStreamExtension, ManualLapStreamExtension, MultisportMarker, PauseMarkerExtension,
PoolLengthExtension, PowerStreamExtension, RelativePerformanceLevelStreamExtension,
SeaLevelPressureStreamExtension, SkiExtension, SpeedStreamExtension, StepCountDeltaStreamExtension,
StrokeRateStreamExtension, StrokesDeltaStreamExtension, SummaryExtension, SwimmingHeaderExtension,
SwolfStreamExtension, TemperatureStreamExtension, VerticalLapExtension, VerticalSpeedStreamExtension,
WeatherExtension, ZappChannelsExtension
```

Note the spelling `HeartrateStreamExtension` (lower-case r) next to `HeartRateExtension`, and
`MultisportMarker` without "Extension". Names are case-sensitive, an unknown name makes the whole
call fail with 400, and an extension the workout does not have is simply left out (likely;
googlarz). Which extensions come back when `extensions` is left out: **not documented**.

Answer: envelope, `payload` = one workout (3.4.3). Errors: 400, 403 (and 500 for a malformed
key, FAQ).

#### GET `/v3/workouts/{workoutIdOrKey}/fit` (FIT export)

`workoutIdOrKey`: "Workout identifier (workoutKey)". Answer: `application/octet-stream`, "User
workout data in Garmin FIT format". Errors: 400, 403, 404. A key that does not exist gives 403,
not 404 (unverified; googlarz). The FAQ: "Fit files has most comprehensive dataset from each
workout", with all samples, laps and summary values. The FIT content is described on
`/fit-description` (session, lap, record, length, event, dive messages and Suunto developer
fields). MCP for Suunto v1 does not parse FIT.

#### 3.4.3 Workout object (`LimitedWorkout`)

Same schema in v2 and v3 (the two schema files are identical).

| Field | Type | Unit and notes |
| --- | --- | --- |
| `workoutKey` | string | "Workout unique id". 24 hex characters. |
| `key` | string | "Workout key" (relation to `workoutKey` not documented) |
| `workoutId` | int32 | not described |
| `workoutName`, `description` | string | |
| `activityId` | int32 | Suunto App activity id (section 8) |
| `startTime`, `stopTime` | int64 | **epoch milliseconds**. The schema text says "seconds since Epoch", but the FAQ says "UNIX epoch milliseconds" and the examples (`1526196562327`, webhook `1702729200000`) are milliseconds. |
| `timeOffsetInMinutes` | int32 | "Timezone offset in minutes. 0 for UTC." FAQ: the user's local time difference to UTC "at the time when the exercise stopped". Local time = UTC + offset. |
| `created` | int64 | unit not documented |
| `totalTime` | double | **seconds** (schema). Timer time without pauses (likely; open-wearables). |
| `totalDistance` | double | **metres** |
| `totalAscent`, `totalDescent` | double | unit not documented (example `88.75`); metres (likely) |
| `maxAltitude`, `minAltitude` | float | unit not documented; metres (likely); barometer or GPS |
| `avgSpeed`, `maxSpeed` | double / float | The schema text says **km/h**. Both examples fit **m/s**: 3900 m in 2686.03 s is 1.45, the value given; webhook: 10000 m in 3600 s, `avgSpeed` 2.78. Treat as m/s (likely; open-wearables reads m/s too). |
| `avgPace` | double | unit not documented. Example `11.48` matches minutes per km for 1.45 m/s (1000 / 1.452 / 60 = 11.48) (likely). |
| `energyConsumption` | int32 | **kcal** (schema) |
| `recoveryTime`, `cumulativeRecoveryTime` | int64 | seconds |
| `stepCount` | int32 | no description; a step count (likely) |
| `cadence` | float | schema: a number, "round per minute" average. The list example has an object `{"max": 0, "avg": 0}` (unit unverified). Accept both. |
| `hrdata` | object | `userMaxHR` ("Maximum heart rate at the time of workout"), `workoutAvgHR`, `workoutMaxHR`, all bpm (documented). The list example also has `hrmax`, `max`, `avg`. Third parties read `max` as the user's max HR setting and `hrmax` as the workout max (likely; open-wearables). |
| `startPosition`, `stopPosition`, `centerPosition` | `{"x": double, "y": double}` | **x = longitude, y = latitude**. Not stated for workouts; the POI schema states it for the same `x`/`y` shape, and the workout examples (x 23.84, y 61.45 in Finland) fit. |
| `extensionTypes` | string[] | which data the workout has, as short upper-case names (for example `HEARTRATESTREAM`). Enum: `SKI`, `MULTISPORTMARKER`, `SUMMARY`, `EPOCSTREAM`, `VERTICALSPEEDSTREAM`, `CADENCESTREAM`, `DEPTHSTREAM`, `POWERSTREAM`, `SEALEVELPRESSURESTREAM`, `STROKERATESTREAM`, `SWOLFSTREAM`, `TEMPERATURESTREAM`, `SWIMMINGHEADER`, `INTENSITY`, `FITNESS`, `HEARTRATE`, `ALTITUDESTREAM`, `HEARTRATESTREAM`, `LOCATIONSTREAM`, `SPEEDSTREAM`, `PAUSEMARKER`, `MANUALLAP`, `INTERVAL`, `VERTICALLAP`, `DISTANCEDELTA`, `STEPCOUNTDELTA`, `STROKESDELTA`, `SKITURN`, `SKIHEADER`, `APPBUNDLEID` |
| `extensions` | object[] | each object has a `type` (for example `"SummaryExtension"`); section 5 |
| `workoutAchievements` | object[] | `{"type": ..., "value": double, "replacedByWorkout": {"present": bool}}`; `type` is one of `TIME_FOR_100M`, `TIME_FOR_500M`, `TIME_FOR_1KM`, `TIME_FOR_5KM`, `TIME_FOR_10KM`, `TIME_FOR_HALF_MARATHON`, `TIME_FOR_MARATHON`, `AVERAGE_PACE`, `AVERAGE_SPEED`, `DISTANCE`. Units of `value`: not documented. |
| `achievements` | string[] | not described |
| `rankings` | object | `{"totalTimeOnRouteRanking": {"originalRanking": int, "originalNumberOfWorkouts": int}}` |
| `commentCount`, `pictureCount` | int32 | (`viewCount` appears in the example only) |
| `accessible` | bool | not described |
| `isEdited` | bool | "Indicates is workout manually edited or not" |

The mapping between `extensionTypes` values (for example `HEARTRATESTREAM`) and extension names
(for example `HeartrateStreamExtension`) is not documented. The webhook workout object also has
the fields above (section 4).

### 3.5 SUUNTO WORKOUT API v2 (deprecated, `/v2`)

| Operation | Method and path |
| --- | --- |
| List workouts | `GET /v2/workouts` |
| Get workout (with location points) | `GET /v2/workouts/{workoutKey}` |
| Get workout (without location points) | `GET /v2/workouts/{workoutKey}/summary` |
| Export FIT | `GET /v2/workout/exportFit/{workoutIdOrKey}` (note: `workout`, singular) |

- Same list parameters, same answer and same workout schema as v3 (documented).
- Differences: v2 has **no `extensions` parameter**; v2 "get" includes location points and
  `/summary` leaves them out. How location points appear in the JSON is **not documented**.
- The how-to-start example still calls `/v2/workouts`. New code uses v3.

### 3.6 SUUNTO WORKOUT DESCRIPTION API (`/v1/workouts`)

```
POST https://cloudapi.suunto.com/v1/workouts/addinfo/{workoutId}
```

"Add additional info to workout description." `workoutId`: string, "ID of the workout to be
modified" (key or numeric id: not documented). **The request body is not documented** (no
schema, no example). Answer: 200 `application/json` (body not documented). Errors: 400, 403,
500. Not used by MCP for Suunto v1.

### 3.7 SUUNTO ROUTE API (`/v2/route`)

| Operation | Method and path | Answer |
| --- | --- | --- |
| List routes | `GET /v2/route` | JSON list of `PartnerRoute` |
| Get route | `GET /v2/route/{oid}` | `PartnerRoute` |
| Export GPX | `GET /v2/route/{oid}/export` with `Accept: application/gpx+xml` (required) | GPX |
| Import GPX | `POST /v2/route/import?activities=1,2` with a GPX body, `Content-Type: application/gpx+xml` | 200 `application/json` (body not documented) |
| Update | `PUT /v2/route/{oid}` with `Content-Type` and `Accept: application/gpx+xml` | updated GPX |

- There is **no delete** operation.
- Export without the `Accept` header answers 500 (unverified).
- Import: the 200 body is not documented; one client reads `{"items": [{"id": ...}]}`
  (unverified). Limits on file size or number of points: **not documented**. Imported routes
  appear as `PRIVATE` (unverified).
- Watch sync: routes "are shown in Suunto App and can be then synched to Suunto watches for
  navigation" (FAQ); the user "can choose to use [them] in watch" (route page). The route object
  has `watchEnabled`.

List query parameters (documented):

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int32 | `0` | page number |
| `size` | int32 | `5` | items per page; maximum not documented |
| `since` | int64, epoch ms | none | "Only routes modified since the given timestamp are returned." |
| `sort` | string | `asc` | `asc` or `desc`; the field it sorts on is not documented |

`PartnerRoute` (schema; required: `activityIds`, `visibility`, `watchEnabled`). Documented example
from `/route-description`:

```json
{"id": "604bcfc20a76e57785370afe", "description": "Kerava - Sipoo", "visibility": "PRIVATE",
 "activityIds": [3],
 "startPoint": {"altitude": 61, "latitude": 60.39826, "longitude": 25.13782},
 "centerPoint": {"altitude": 37, "latitude": 60.350983, "longitude": 25.15516},
 "endPoint": {"altitude": 45, "latitude": 60.314384, "longitude": 25.113018},
 "created": 1615581137000, "averageSpeed": 2.2222223, "totalDistance": 13696,
 "modified": 1640418238351, "watchEnabled": true, "turnWaypointsEnabled": false}
```

| Field | Notes |
| --- | --- |
| `id` | route id (`oid` in paths) |
| `description` | the example shows the route name here; there is no `name` field |
| `visibility` | string; `PRIVATE` in this example, `public` in the webhook example; other values not documented |
| `activityIds` | Suunto App activity ids (int32 list, no enum). A separate `activities` schema in the same API lists 0..93, which is out of date: the webhook example uses 101 and 102, and the activity list now goes to 121. |
| `startPoint`, `centerPoint`, `endPoint` | `{altitude, latitude, longitude}` (altitude unit not documented) |
| `created`, `modified` | epoch ms (example only) |
| `averageSpeed` | unit not documented (m/s, unverified) |
| `totalDistance` | unit not documented (metres, unverified) |
| `watchEnabled`, `turnWaypointsEnabled` | bool |

GPX rules (documented on `/route-description`):

- Import: routes from `rte` or `trk` elements; **each `rte`/`trk` becomes a separate route**.
  Imported per point: latitude, longitude, elevation, name, type. The route page example writes
  elevation as `<elevation>`, while standard GPX and Suunto's own export use `<ele>`. Which one
  the import reads is unverified. Send `<ele>`.
- Route name priority: `rte.name`/`trk.name`, `rte`/`trk` description, `metadata.name`,
  `metadata.description`, else "Unnamed route". A single `metadata` link is used as a back link.
- Activities come only from the `activities` query parameter (comma-separated Suunto App ids).
  Default `1` (running). The GPX content does not set them.
- Waypoints come from `wpt` elements with the same coordinates as a route point, and from route
  points that have a name or a type. No name: unnamed waypoint; no type: type `Waypoint`.
- Waypoint types (case-insensitive; unknown types become `Waypoint`): `Aid_station`,
  `Avalanche`, `Beach`, `Bedding`, `Begin`, `Big_fish`, `Biggame`, `Bird`, `Building`, `Cafe`,
  `Camp`, `Campfire`, `Camping`, `Car`, `Cave`, `Cliff`, `Coast`, `Coral_reef`, `Crossroads`,
  `Danger`, `Emergency`, `End`, `Fish`, `Fishing_spot`, `Food`, `Forest`, `Geocache`, `Hill`,
  `Home`, `Hostel`, `Hotel`, `Info`, `Kelp_forest`, `Lagoon`, `Lake`, `Left_at_fork_turn`,
  `Left_turn`, `Lodging`, `Marine_mammals`, `Marine_reserve`, `Meadow`, `Mountain`, `Mushrooms`,
  `Parking`, `Peak`, `Prints`, `Restaurant`, `Right_at_fork_turn`, `Right_turn`, `River`, `Road`,
  `Rock`, `Roundabout_exit_1_turn` to `Roundabout_exit_5_turn`, `Roundabout_exit_n_turn`, `Rub`,
  `Scrape`, `Sharp_left_turn`, `Sharp_right_turn`, `Shot`, `Sight`, `Slight_left_turn`,
  `Slight_right_turn`, `Smallgame`, `Stand`, `Straight_turn`, `Trail`, `Trailcam`, `U_turn`,
  `Valley`, `Water`, `Water_point`, `Waterfall`, `Waypoint`, `Wreck`. Watches may shorten names.
- Export GPX uses the namespace `xmlns:suunto="http://www.suunto.com/xmlschemas/RouteExtension/v1"`,
  `creator="Suunto app"`, `metadata/author/name` (the username), and
  `metadata/extensions/suunto:route` holding `suunto:id`, `suunto:revision` (for example
  `1791291783072`), `suunto:activityIds/suunto:activityId` and `suunto:turnWaypointsEnabled`;
  route points may carry `extensions/suunto:routePoint` with `suunto:name`, `suunto:type`,
  `suunto:description`.

Update rules (documented): first export the GPX, edit it, then PUT it. The GPX must contain
`suunto:id` (equal to `oid`) and the current `suunto:revision`. A stale revision gives **409**
("Fetch the latest GPX ... and retry"). 400: invalid GPX, missing id or revision, id mismatch, or
not exactly one route. 403: no permission. 404: route not found. 500 is also listed. The answer
is the full GPX with a new revision. The description shows the URL `https://cloudapi-partner.suunto.cn/v2/route/{oid}`;
on the global API the path is `https://cloudapi.suunto.com/v2/route/{oid}` (unverified).

Errors for list, get and export: 400, 401, 403, 404. Import: 400, 403, 500.

### 3.8 SUUNTO POINT OF INTEREST API (`/v2/poi`)

| Operation | Method and path | Body | Answer |
| --- | --- | --- | --- |
| List | `GET /v2/poi?limit={n}&offset={n}` | | list of `PointOfInterestResult` |
| Get | `GET /v2/poi/detail?poiKey={poiKey}` | | `PointOfInterestResult` |
| Create | `POST /v2/poi/create` | `PointOfInterestCreateRequest` | `PointOfInterestResult` |
| Upsert | `PUT /v2/poi/{poiKey}` | `PointOfInterestUpsertRequest` | `PointOfInterestResult` |

- POIs "are shown in the user's Suunto profile and can be synchronized to compatible Suunto
  watches for navigation" (API description).
- `limit`, `offset`: int32; defaults and maximum not documented. There is **no delete**.
- Rules (documented): `watchEnabled` must be `true`; `point.type` must be a `PoiType` value; for
  upsert, `poiKey` in the path must equal `key` in the body. `key` is optional on create.
  Required fields: `point` (with `x`, `y`, `type`) and `watchEnabled`, plus `key` on upsert.
  Upsert creates the POI when the key does not exist yet.
- Errors: 400, 403, 500; get also 404.

Documented example answer:

```json
{"pointOfInterest": {"creation": 1602074065, "modified": 1602074065,
  "point": {"x": 45.1, "y": 32.2, "z": 11.5, "name": "Beautiful POI", "type": 1},
  "activityId": 1, "country": "FI", "locality": "FI", "watchEnabled": true,
  "key": "5e3be95baba83c5b1781593b"}}
```

| Field | Notes |
| --- | --- |
| `point.x`, `point.y`, `point.z` | **longitude**, **latitude** (schema), altitude (unit not documented) |
| `point.name`, `point.type` | string; `PoiType` int (below) |
| `key`, `activityId`, `country`, `locality` | unique key; Suunto activity id; strings |
| `creation`, `modified` | int64 timestamps; unit not documented, example in seconds |
| `errorCode` | int32, next to `pointOfInterest` in each result; meaning not documented |

`PoiType` (schema): -1 Unknown, 0 Building, 1 Home, 2 Car, 3 Parking, 4 Camp, 5 Camping, 6 Food,
7 Restaurant, 8 Cafe, 9 Lodging, 10 Hostel, 11 Hotel, 12 Water, 13 River, 14 Lake, 15 Coast,
16 Mountain, 17 Hill, 18 Valley, 19 Cliff, 20 Forest, 21 Crossroads, 22 Sight, 23 Begin, 24 End,
25 Geocache, 26 POI, 27 Road, 28 Trail, 29 Rock, 30 Meadow, 31 Cave, 32 Emergency,
33 Information, 34 Peak, 35 Waterfall, 36 FishingSpot, 37 Bedding, 38 Prints, 39 Rub, 40 Scrape,
41 Stand, 42 TrailCam, 43 BigGame, 44 SmallGame, 45 Bird, 46 Shot, 47 Fish, 64 BigFish,
65 CoralReef, 66 Beach, 67 MarineMammals, 68 KelpForest, 69 Lagoon, 70 Wreck, 71 MarineReserve,
72 Avalanche, 73 Danger, 74 AidStation, 75 WaterPoint, 76 Mushrooms, 77 Campfire.

### 3.9 SUUNTO UPLOAD API (`/v2/upload`)

Flow (documented on `/how-to-workout-upload`):

1. **Init**: `POST https://cloudapi.suunto.com/v2/upload` (operation path `/`), JSON body, all
   fields optional: `description` (string), `comment` (string, "use it as notes"), `notifyUser`
   (bool, default `true`, push notification; set `false` for bulk uploads), `privacy`
   (`DEFAULT`, `PRIVATE`, `FOLLOWERS` or `PUBLIC`; how-to page only, not in the schema).
   Answer (`Upload`): `id`, `url` (an Azure Blob SAS URL), `headers` (`{"x-ms-blob-type": "BlockBlob"}`),
   `method` (`"PUT"`), `description`, `comment`, `dataType` (`"FIT"`), `notifyUser`, `curlString`
   (for testing only; "do not use it in your application"). Errors: 400, 403, 422 (wrong
   parameters, for example an unsupported data type).
2. **Upload**: send the FIT file with the given `method` (PUT), `url` and `headers`. Azure answers
   **201 Created**. Only FIT is supported. How long the URL stays valid: not documented. In the two
   examples the SAS expiry (`se=`) is 12 hours and 24 hours after the creation time held in the
   upload `id` (its first 8 hex digits are a Unix time; example only).
3. **Status**: `GET https://cloudapi.suunto.com/v2/upload/{id}`. Answer (`UploadStatus`): `id`,
   `description`, `dataType`, `status`, `message`, `workoutKey`, `comment`, `notifyUser`; the
   example also has `name` and `webUrl` (`https://www.suunto.com/move/username/<workoutKey>`).
   Errors: 403, 404, 422.

`status` values: `NEW` (no data yet), `ACCEPTED` (data received), `PROCESSED` (workout created;
`workoutKey` is set), `ERROR` (`message` may explain). Suunto App shows only a limited set of data
fields from imported files (see `/fit-description`). Not used by MCP for Suunto v1.

### 3.10 SUUNTO GUIDES API (`/v2/guides`)

| Operation | Method and path | Answer |
| --- | --- | --- |
| List guides | `GET /v2/guides/items` | envelope, `payload` = list of guide metadata |
| Download guide | `GET /v2/guides/files/{id}` | ZIP (`Content-Disposition: attachment; filename="<id>-guide.zip"`) |
| Create | `POST /v2/guides/files`, `Content-Type: application/zip`, ZIP body | 201, envelope with one guide |
| Update | `PUT /v2/guides/files/{id}`, `Content-Type: application/zip`, ZIP body | 200, envelope with one guide |
| Delete | `DELETE /v2/guides/files/{id}` | 200 |

- List parameters (how-to page): `offset` (default 0), `limit` (default 50), `fileSince` (epoch
  ms; only guides with `fileModificationTime` greater than or equal to it). Sorted by
  `fileModificationTime` descending. **Only guides created by your app are returned.**
- Update replaces only the content; `pinned`, `username` and `id` stay. Both modification times
  change.
- Errors: create and update: 400 invalid guide
  (`{"error": {"description": "Invalid step type: 'notfication'"}, "payload": null, "metadata": {"ts": "1621925931041"}}`),
  403, 409 (the user already has a guide with the same `externalId`). Update, download and
  delete: 404 (does not exist, other user, or created by another partner), 403. List: 403.
- The `owner` field in `guide.json` "should match your application name in OAuth settings".

Guide metadata (`GuideSuuntoplusPlugin`): `id`, `username`, `modificationTime` and
`fileModificationTime` (epoch ms), `name`, `description`, `shortDescription`, `richText`
(Markdown), `owner`, `url`, `iconUrl`, `type` (schema `SEQUENCE`, examples `sequence`),
`activities` (activity ids), `localDate` (`yyyy-MM-dd`, user's local date), `usage` (schema
`WORKOUT`, examples `workout`), `pinned` (bool: the user keeps it on the watch), `externalId`.

Guide ZIP format (documented, compact):

- Files: `guide.json` (required) and `icon.png` (required, 300 x 300 px, may become publicly
  reachable). The older PDF also lists a `manifest.json` (`name`, `type`, `owner`,
  `description`); the current page does not.
- Guide object: `type` "sequence" (required), `name` (1-60, required), `description` (1-256,
  required), `richText` (Markdown, 1-100000), `shortDescription` (1-23, required, shown on the
  watch), `owner` (1-64, required), `url` (1-256, valid URL, required), `activities` (1-100 ids),
  `usage` "workout" (required), `localDate` (`yyyy-MM-dd`), `externalId` (1-64; written into FIT
  files of workouts that used the guide), `steps` (1-1000, required).
- Step kinds: **FieldsStep** `{"type": "fields", "id"?, "title"? (1-13), "createManualLap"?, "transitions"?, "fields": [...], "notification"? {"title" 1-13, "text" 1-54}}`
  and **RepeatStep** `{"type": "repeat", "id"?, "times": 1-100, "steps": [FieldsStep, ...]}` (no
  nesting). The first step starts with the workout.
- Transition: `{"condition": {...}, "stepId"?}`; without `stepId` the next step runs. Conditions:
  `manualLap`, `stepDistance` (m), `distance` (m, whole workout), `stepDuration` (s, pauses
  excluded), `duration` (s, whole workout), `location` (`latitude`, `longitude`, optional
  `distance` m, optional `direction` degrees), `routeCompleted`, `routeExited`, `or` and `and`
  (`conditions` list).
- Fields (optional `title`, short): `text` (`value` 1-54 chars; over 40 hides other fields),
  `stepDurationCountdown` (s), `stepDistanceCountdown` (m), `heartRate`, `speed`, `pace`,
  `power`, `altitude`, `distance`, `duration`, `temperature`, `cadence`, `strokeRate`, `strokes`,
  `energy`, `ascent`, `descent`, `verticalSpeed`, `swolf`, `ascentTime`, `descentTime`, and
  targets `targetHeartRate` (bpm), `targetSpeed` (m/s), `targetPace` (m/s), `targetPower` (W),
  `targetCadence` (Hz) with `value` or `min`/`max`. Many fields take `window` (`workout`,
  `manualLap`, some also `step`) and `aggregate` (`average`, `min`, `max`).
- A step may hold a `route` (`points` with `latitude`, `longitude`, optional `distance` m;
  `distance` m; `width` m) for the route conditions.
- The how-to example uses keys not in the reference (`"trigger"` in steps, a step type
  `"notification"`). Follow the reference. Watches render only a small character set reliably.

Not used by MCP for Suunto v1.

---

## 4. Webhooks

MCP for Suunto v1 does not use webhooks. Short facts for later (documented on `/webhooks`):

- Set the notification URLs and a **notification secret** in the OAuth app settings. Routes have
  their own "Route Notification Url".
- Types (`type` field; the page says "three types" but lists five): `WORKOUT_CREATED`,
  `ROUTE_CREATED`, `SUUNTO_247_ACTIVITY_CREATED`, `SUUNTO_247_SLEEP_CREATED`,
  `SUUNTO_247_RECOVERY_CREATED`.
- Every JSON body has `type` and `username` (the `user` claim of section 2.5).
  - Workout: `workout` (a subset of the workout object of 3.4.3, `startTime` in ms) and `gear`
    (`{"manufacturer": "Suunto", "name": "Suunto Vertical", "productType": "SPORT_WATCH"}`).
  - Route: `route` (a `PartnerRoute`). The route page says it fires on create **and** on modify;
    its older example has no `type`.
  - 247: `samples`, the same items as the matching `/247samples` answers.
- Legacy workout notification: a separate URL, `application/x-www-form-urlencoded` body
  `workoutid=workout123&username=johndoe123`.
- Signature: header `X-HMAC-SHA256-Signature` = hex HMAC-SHA256 of the raw body with the
  notification secret. `User-Agent: SuuntoPartnerIntegration/1.0.0`.
- Answer with any 2xx within **2 seconds**. Failures are retried with exponential backoff; too
  many failures trip a circuit breaker that pauses all notifications for the app for a while.
- FAQ: no webhook exists for daily activity (outdated: the 247 webhooks above exist now).

---

## 5. Workout extensions

Extensions come in the `extensions` array of a workout (3.4). Each item has a `type` with the
extension name. Suunto documents the **name list** (3.4) but the JSON format of **only one**
extension, and only through an example.

### 5.1 SummaryExtension (example only)

From the workout list example:

```json
{"type": "SummaryExtension", "pte": 2.0, "feeling": null, "avgTemperature": 302.44998,
 "maxTemperature": null, "peakEpoc": 14.5, "avgPower": null, "maxPower": null,
 "avgCadence": 0.9801348, "maxCadence": null, "ascentTime": 1178.0, "descentTime": 1043.0,
 "performanceLevel": null}
```

No unit is documented. Readings:

| Field | Likely meaning and unit | Why |
| --- | --- | --- |
| `pte` | peak training effect (unverified) | FIT `total_training_effect` is "PeakTrainingEffect" |
| `feeling` | 1 (worst) to 5 (best) (unverified) | FIT developer field `feeling`, range 1-5 |
| `avgTemperature`, `maxTemperature` | **kelvin** (likely) | `302.44998` is 29.3 degrees C; as Celsius it would be impossible on a wrist |
| `peakEpoc` | EPOC peak (unverified) | FIT field `peak_epoc` (documented there with unit "l/kg") |
| `avgPower`, `maxPower` | watts (unverified) | FIT power fields |
| `avgCadence`, `maxCadence` | **Hz** (revolutions or step pairs per second) (unverified) | `0.98` per second is 59 per minute; guide targets use Hz for cadence |
| `ascentTime`, `descentTime` | seconds (likely) | `1178 + 1043` is below `totalTime` 2686.03 |
| `performanceLevel` | unknown | |

Newer watches also put a `gear` object here: `{manufacturer, name, displayName, serialNumber,
softwareVersion, hardwareVersion}` (likely; open-wearables).

### 5.2 Other extensions (third-party evidence only)

Suunto documents the JSON format of **no other extension in the list of 3.4**. The shapes below
come from third-party code. Treat them as hints, not as a contract.

| Extension | Shape seen | Label and source |
| --- | --- | --- |
| Stream extensions (`HeartrateStreamExtension`, `SpeedStreamExtension`, `AltitudeStreamExtension`, `CadenceStreamExtension` and similar) | `{"type": ..., "points": [{"timestamp": ..., "value": ...}, ...]}`. Speed values in m/s. | likely; hicso21 (partner API code) |
| Point `timestamp` in streams | absolute epoch ms, not relative | unverified; seen only in code for the internal sports-tracker API (workout-tracker) |
| `HeartrateStreamExtension` unit | bpm or Hz (beats per second); one client defends against Hz | unverified |
| `LocationStreamExtension` | `{"type": ..., "locationPoints": [{"timestamp", "latitude", "longitude", "altitude", optional "speed", "bearing", "ehpe"}]}` | likely; hicso21 (the optional fields come from internal-API types) |
| `PauseMarkerExtension` | `pauseMarkers: [{startTime, endTime (epoch ms), automatic}]` | likely; open-wearables |
| `IntensityExtension` | `zones.heartRate.<zone>.totalTime` | likely; hicso21 |
| `DiveHeaderExtension` | `maxDepth` (m), `avgDepth`, `diveTime` (s), `pauseDuration`, `maxDepthTemperature` (kelvin), `diveMode`, `diveNumberInSeries`, `surfaceTime`, `gasesUsed`, `gasQuantitites` (spelled like this), `gasConsumption`, `algorithmLock`, `cns`, `otu`, `personalSetting`, `altitudeSetting`, `algorithm`, `minGF`, `maxGF`. Units of `surfaceTime` and the gas values unknown. | unverified for the partner API; seen only from the internal sports-tracker API (submersion test fixture) |
| `DepthStreamExtension`, `TemperatureStreamExtension` | probably the `points` pattern | unverified |
| `WeatherExtension`, `FitnessExtension`, `SkiExtension`, `SwimmingHeaderExtension`, `HeartRateExtension`, lap and marker extensions | nothing known | not documented |

Rules for the code: request extensions by name (an unknown name fails the whole call, 3.4), pass
unknown objects through as they are, never assume a unit, and treat every field as optional.
Record real shapes in this file once seen. For dive data the documented source is the FIT file
(`/fit-description`: `max_depth` and `avg_depth` in metres, `surface_interval` in seconds,
`dive_mode`, gas messages with `oxygen_content` and `helium_content` percent, `gf_low`,
`gf_high`).

---

## 6. Gotchas

1. OAuth runs on `cloudapi-oauth.suunto.com` (the portal shows the wrong host), data on
   `cloudapi.suunto.com`. No subscription key on OAuth calls; both headers and `Bearer` on data.
2. The Developer API allows 10 calls per minute and **200 calls per week** for the whole app.
3. Workout list filters on **modification time** by default. Use
   `filter-by-modification-time=false` to filter on start time.
4. `since` is inclusive, `until` is exclusive, both epoch **milliseconds**.
5. `startTime` and `stopTime` are epoch **milliseconds**, not seconds as the schema text says.
   Local time = UTC + `timeOffsetInMinutes` (offset at the end of the workout).
6. Workout `avgSpeed`/`maxSpeed`: schema says km/h, examples are m/s. `avgPace` looks like min/km.
7. Workout `energyConsumption` is **kcal**; 247 `EnergyConsumption` and daily statistics are
   **joules** (1 kcal = 4184 J).
8. Workout temperatures (SummaryExtension) look like **kelvin**.
9. `SpO2`, `MaxSpo2` and recovery `Balance` are fractions **0..1**, not percent.
10. Sleep durations are **seconds**; `Duration` includes awake time.
11. 247 and daily activity: maximum **28 days** per call, stored and queried in **UTC**;
    `from`/`to` are epoch ms but `startdate`/`enddate` are ISO strings. Timestamps come with `Z`
    or a local offset (`+02:00`): parse both and keep the offset.
12. Daily statistics `Value` can be `null`, and a date can appear twice (one null, one not).
13. A malformed workout key can give **500** (FAQ). Check the key format (24 hex characters) first.
14. Several doc examples are not valid JSON or disagree with the schema: envelope metadata
    values are strings (`"workoutcount": "1"`), `cadence` can be a number or an object,
    `hrdata` may carry extra keys. Parse defensively and treat every field as optional.
15. Positions are `x` = longitude, `y` = latitude (workouts, POI). Routes use `latitude` and
    `longitude` names.
16. Route list pages hold 5 items by default (`size`), starting at `page=0`.
17. Route update needs the latest exported GPX (`suunto:revision`) or it fails with 409.
18. POI timestamps look like **seconds**; POI writes need `watchEnabled: true`; no POI delete.
19. Guides: only your own guides are listed; `owner` must equal the OAuth app name; duplicate
    `externalId` gives 409.
20. Polling is discouraged everywhere and prohibited for the routes list.
21. The FAQ is partly outdated (sleep, POI, webhooks for daily data); so is the route page on POIs.
22. Store the newest refresh token from every token answer and run only one refresh per user at a
    time; an old refresh token may stop working after one use.
23. Do not delete a user's tokens on the first `invalid_grant`: Suunto has sent false ones during
    an outage.
24. Limit answers are not documented: expect 429 (rate), 403 with a quota text (weekly quota),
    maybe 401 with "RateLimitExceeded", and 503 on 247. None of them means "token expired".
25. The 247 doc example call spans 212 days; the real maximum is 28 days.
26. An unknown name in `extensions` fails the whole workout call with 400 (likely).
27. Send the `state` parameter on authorize and check it on return (likely echoed); treat an
    `error` parameter on the redirect as a refusal.

---

## 6b. Confirmed by real calls (2026-11-10)

These answers come from real calls made while setting up the hosted service's own Suunto app.
No user data was involved.

| Call | Answer |
| --- | --- |
| `POST /oauth/token` with the right client id and secret, `grant_type=authorization_code`, a made-up code | HTTP 400, JSON `{"error":"invalid_grant"}` |
| the same with a wrong client secret | HTTP 401, JSON `{"error":"invalid_client"}` |
| `GET https://cloudapi.suunto.com/v3/workouts?limit=1` with a valid subscription key and no `Authorization` header | HTTP 401, plain text: `JWT not present. (TokenNotPresent)` followed by the lines `APIM Url: ...` and `Backend Url: ...` |
| the same with a wrong subscription key | HTTP 401, plain text: `Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription. (SubscriptionKeyInvalid)` followed by the same two URL lines |

So data API errors from the gateway are **plain text, not JSON**, with a code in brackets at the
end of the first line. Show only the first line to users. A 401 with `(SubscriptionKeyInvalid)` is
an operator problem; a 401 with a `Token...` code is a user token problem (refresh once).

The API Zone's "OAuth application settings" form takes several redirect URIs (one per line), and
the client secret is chosen by the partner (the form keeps the current one when the field is left
empty). An app that was never saved has `isNew: true` and a client id that changes on every page
load until the form is saved once.

## 7. Open questions

These need a real account and a real call.

1. **Q1 Authorize.** `state` is likely passed back: confirm. Does `scope` change anything? On a
   refusal, is it `error=access_denied`? Is PKCE supported?
2. **Q2 Token request.** Form body likely works (and the query string too): confirm. Exact 400
   (`invalid_grant`, likely) and 401 bodies?
3. **Q3 Refresh.** A new refresh token comes back (likely): does the old one stop working at once?
   Refresh token lifetime, and does it carry `exp`?
4. **Q4 `user`.** The `user` field is likely in the `authorization_code` answer: confirm, and
   check the refresh answer. Meaning of the `sub`, `uk` and `ukv` claims.
5. **Q5 Deauthorize.** Effect on tokens and webhooks; any notice when the user disconnects in the
   Suunto App? What does a call with a revoked token answer?
6. **Q6 Limits.** Production rate limits; is the Developer limit per key; confirm 429 for the
   minute limit and 403 with `Retry-After` for the weekly quota; when does a 401
   "RateLimitExceeded" happen?
7. **Q7 Bearer.** Is the `Bearer` prefix required, or is the raw token accepted too?
8. **Q8 Workout list.** Sort order, maximum `limit`, meaning of `metadata.workoutcount` and
   `metadata.until`; does the list include `extensions`?
9. **Q9 Units.** `avgSpeed`/`maxSpeed` (km/h or m/s), `avgPace`, `totalAscent`, altitudes,
   `created`, route `averageSpeed` and `totalDistance`, POI `creation`.
10. **Q10 Extensions.** Defaults of `GET /v3/workouts/{key}`; check the third-party shapes of 5.2
    (stream `points`, `locationPoints`, `pauseMarkers`); HR stream unit (bpm or Hz); are stream
    timestamps absolute epoch ms; does the partner API serve `DiveHeaderExtension`, and in which
    units; `extensionTypes` to name mapping; does an unknown name really give 400?
11. **Q11 v2 location points.** How do they appear in `/v2/workouts/{key}`?
12. **Q12 247 samples.** Interval (likely 10 minutes for activity, 30 for recovery);
    per-sample `StepCount`/`EnergyConsumption` (likely); missing fields; day boundaries and time
    stamps of daily statistics (start-date based or local noon); is exactly 28 days refused;
    `Value` number or string; do sleep and recovery need extra subscriptions?
13. **Q13 Sleep.** Which date a sleep belongs to; meaning of `SleepId`, `BodyResourcesInsightId`.
14. **Q14 `/247` versus `/247samples`.** Same daily statistics data?
15. **Q15 addinfo.** Request body of `POST /v1/workouts/addinfo/{workoutId}`; key or numeric id?
16. **Q16 Routes.** Import answer body (`{"items": [{"id": ...}]}`?); import size limits;
    `<ele>` or `<elevation>`; `sort` field; maximum `size`; values of `visibility`.
17. **Q17 POI.** List defaults and maximum; meaning of `errorCode`; any way to delete.
18. **Q18 Upload.** Validity of the upload URL; is `privacy` accepted?
19. **Q19 Error bodies.** Shape of 400, 401, 403 and 500 answers per API; does an expired
    access token give 401 or 403?
20. **Q20 Workout ids.** Relation of `workoutKey`, `key` and `workoutId`; does FIT export accept
    the numeric id ("workoutIdOrKey")? Does an unknown key on `/fit` give 403 or 404?
21. **Q21 Developer API users.** Can any Suunto App user authorize an app on the Developer API,
    or only the developer's testers? No document limits it.

---

## 8. Appendix: activity ids

Suunto App activity ids, used by `activityId` in workouts, route `activityIds`, POI
`activityId` and guide `activities` (from `Activities.pdf`, linked from the workout API page;
id 89 is not listed; ids 92 to 94 exist in the Suunto App only, not on watches):

```
0 Walking, 1 Running, 2 Cycling, 3 Cross-country skiing, 4 Sports, 5 Sports, 6 Sports, 7 Sports,
8 Sports, 9 Sports, 10 Mountain biking, 11 Hiking, 12 Roller skating, 13 Downhill skiing,
14 Paddling, 15 Rowing, 16 Golfing, 17 Indoor sports, 18 Parkouring, 19 Ball games,
20 Outdoor gym, 21 Swimming, 22 Trail running, 23 Gym, 24 Nordic walking, 25 Horseback riding,
26 Motorsports, 27 Skateboarding, 28 Water sports, 29 Climbing, 30 Snowboarding, 31 Ski touring,
32 Fitness class, 33 Soccer, 34 Tennis, 35 Basketball, 36 Badminton, 37 Baseball, 38 Volleyball,
39 American football, 40 Table tennis, 41 Racquet ball, 42 Squash, 43 Floorball, 44 Handball,
45 Softball, 46 Bowling, 47 Cricket, 48 Rugby, 49 Ice skating, 50 Ice hockey, 51 Yoga/pilates,
52 Indoor cycling, 53 Treadmill, 54 Crossfit, 55 Crosstrainer, 56 Roller skiing,
57 Indoor rowing, 58 Stretching, 59 Track and field, 60 Orienteering, 61 Standup paddling,
62 Combat sport, 63 Kettlebell, 64 Dancing, 65 Snow shoeing, 66 Frisbee golf, 67 Futsal,
68 Multisport, 69 Aerobics, 70 Trekking, 71 Sailing, 72 Kayaking, 73 Circuit training,
74 Triathlon, 75 Padel, 76 Cheerleading, 77 Boxing, 78 Scubadiving, 79 Freediving,
80 Adventure racing, 81 Gymnastics, 82 Canoeing, 83 Mountaineering, 84 Telemarkskiing,
85 Openwater swimming, 86 Windsurfing, 87 Kitesurfing, 88 Paragliding, 90 Snorkeling, 91 Surfing,
92 Swimrun, 93 Duathlon, 94 Aquathlon, 95 Obstacle racing, 96 Fishing, 97 Hunting, 98 Transition,
99 Gravel cycling, 100 Mermaiding, 101 Spearfishing, 102 Jump rope, 103 Track running,
104 Calisthenics, 105 E-biking, 106 E-mtb, 107 Backcountry skiing, 108 Wheelchair sport,
109 Hand cycling, 110 Splitboarding, 111 Biathlon, 112 Meditation, 113 Field hockey,
114 Cyclocross, 115 Vertical running, 116 Ski mountaineering, 117 Skate skiing,
118 Classic skiing, 119 Chores, 120 Pilates, 121 Yoga.
```

Unknown ids must be shown as "activity <id>", not guessed. The PDF also maps each id to a FIT
`sport`/`sub_sport`; FIT files use those, not these ids.

---

## 9. Appendix: outside sources

Short names used in the labels above. None of these is official Suunto documentation. The code
was read only to learn facts; nothing was copied.

| Short name | Source |
| --- | --- |
| home page | https://apizone.suunto.com/ (Suunto's own portal home page, fetched 2026-11-10) |
| googlarz | github.com/googlarz/suunto-mcp (`src/auth.ts`, `src/api.ts`, `README`) |
| jb381 | github.com/jb381/suunto-mcp (`CHANGELOG.md`) |
| open-wearables | github.com/the-momentum/open-wearables (Suunto provider docs, OAuth and workout import code) |
| quantified-self | github.com/jimmykane/quantified-self (`functions/src/suunto/auth/*`, `docs/suunto-integration.md`, `functions/src/service-auth-lifecycle.ts`) |
| c2c_tracking | github.com/c2corg/c2c_tracking (`src/server/suunto/*`) |
| CubeTrek | github.com/r-follador/CubeTrek (`SuuntocloudController.java`) |
| hicso21 | github.com/hicso21/Runners-API (Suunto partner API controllers) |
| workout-tracker | github.com/silte/workout-tracker (internal sports-tracker API, not the partner API) |
| submersion | github.com/submersion-app/submersion (test fixture from the internal sports-tracker API) |
| open-health-sync | github.com/soma-intelligence/open-health-sync (`docs/connectors/suunto.md`) |
| Azure docs | learn.microsoft.com, API Management `rate-limit-policy` and `quota-policy` |
| Suunto forum | forum.suunto.com posts 53397, 60250 and 123407 |
| intervals.icu forum | forum.intervals.icu thread 130829 (Suunto wellness sync) |
