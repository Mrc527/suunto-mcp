# The Suunto Cloud API (facts for MCP for Suunto)

MCP for Suunto reads a user's Suunto data through the **official Suunto Cloud API**, as an
accepted Suunto API partner. The user connects with OAuth 2 (authorization code flow), and the
server calls the API with the user's access token and the partner subscription key.

This page is the single source of facts the code is written against. It was put together on
2026-11-10 from the public Suunto API Zone at https://apizone.suunto.com (an Azure API Management
developer portal): the data of its 10 APIs (operations, JSON schemas, examples), its product list,
the pages `/how-to-start`, `/faq`, `/webhooks`, `/route-description`, `/fit-description`,
`/how-to-workout-upload`, `/suuntoplus-guide-description`, `/how-to-use-suuntoplus-guides-api`,
and the linked PDFs `Activities.pdf` and `SuuntoplusGuideCloudAPI.pdf`.

No call to `cloudapi.suunto.com` has been made yet. Labels used below:

- **documented**: Suunto states it in a page, an operation or a schema.
- **example only**: only an example value in the docs shows it.
- **unverified**: our reading of the docs, or a guess. Check it with a real call.
- **not documented**: the docs say nothing about it.

Example values on this page are copied from the Suunto docs.

## Contents

1. [Overview](#1-overview)
2. [OAuth](#2-oauth)
3. [Data APIs](#3-data-apis)
4. [Webhooks](#4-webhooks)
5. [Workout extensions](#5-workout-extensions)
6. [Gotchas](#6-gotchas)
7. [Open questions](#7-open-questions)
8. [Appendix: activity ids](#8-appendix-activity-ids)

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

### 1.3 Subscriptions and limits

| Product | Limits | Source |
| --- | --- | --- |
| Developer API (product id `starter`) | "Subscribers will be able to run 10 calls/minute up to a maximum of 200 calls/week." One subscription per account; no approval needed. | documented (portal product list) |
| Production API | **not documented** publicly. FAQ: "When you are ready with your implementation, please subscribe to the Production API. We will then connect you for next steps." | FAQ |

Also documented: 247 calls take at most **28 days** per request; the routes list has no rate
limit "but we **prohibit polling**"; 247 APIs can answer **503** "Service capacity exceeded";
the Developer API "has same capabilities as the production API", only rate limited.

The 200 calls/week limit is per subscription key, so it is shared by **all users** of the server
(unverified, but the key is the only thing that identifies the app). A multi-user service needs
the Production API.

### 1.4 FAQ points that matter for a multi-user server

- **One account, one app** ("One account is associated to one email address"). Test and
  production services need separate API Zone accounts.
- **Access is for organizations**, "we do not provide this for personal use". A person who runs
  their own copy of the server cannot simply get their own credentials.
- **Development uses the production system** and real user data.
- **User mapping**: the access token JWT has a claim `user` with the Suunto username. Webhooks
  identify the user by this name.
- **Do not poll.** Use webhooks for new workouts. Fetch daily activity when a workout arrives,
  otherwise about once a day or on a user action ("synch" button). "Avoid unnecessary polling."
- **Load**: no status page; more load on weekends and at the start of the year.
- **Credentials**: users sign in with Suunto App credentials; Movescount ones give 401.
- **Publishing**: the app shows in the Suunto App once the Production subscription is accepted.
- **Outdated FAQ answers**: the FAQ says sleep data and points of interest are not available.
  The API now has sleep (3.2) and POI (3.8) endpoints. Trust the API pages.
- **Activity ids**: workout JSON uses the **Suunto App activity ids** (section 8), not FIT ids.

### 1.5 Response envelope and errors

Two styles exist:

- **Envelope** (workouts v2 and v3, guides): `{"error": null | {"code": "...", "description": "..."}, "payload": ..., "metadata": {"<key>": "<string>"}}`.
  Schema name `STTResponse`. Metadata values are **strings**.
- **Plain JSON** (247 data, routes, POI, upload): the payload itself.

Status codes named in the docs:

| Code | Where | Meaning (documented) |
| --- | --- | --- |
| 400 | all | bad request; 247: "Something is wrong with the parameters." |
| 401 | 247, routes, OAuth | "Authentication failed." FAQ: "bad client credentials" with wrong credentials |
| 403 | workouts, routes, POI, upload, guides | forbidden (no text for most) |
| 404 | FIT export, routes, POI get, upload status, guides | not found |
| 409 | route update, guide create/update | revision conflict; duplicate guide `externalId` |
| 422 | upload | "On wrong parameters (e.g. unsupported data type)" |
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
| `state` | ? | **not documented**. Whether it is passed back is unverified. |
| `scope` | ? | **not documented** |

- The user signs in with Suunto App credentials and allows access in a browser (documented).
  "The authorisation process is optimized for mobile use." There is no mobile SDK.
- On success the browser goes to `<REDIRECT_URI>?code=<code>`, for example
  `https://www.example.com/oauth-redirect?code=G5ahWs` (documented).
- What the redirect carries when the user refuses or on an error: **not documented**.

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
  Use the form body (the OAuth standard); which one works for sure is **unverified**.
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
| `scope` | `"workout"` in the example. Other values: not documented. |
| `user` | the webhooks page says the Suunto user id is "the `user` field in the OAuth access token response". It is missing from the how-to-start example: **unverified**. |

Errors: HTTP 400 (body not documented). Wrong client credentials: 401 "bad client credentials"
(FAQ).

### 2.4 Refresh

```
POST https://cloudapi-oauth.suunto.com/oauth/token?grant_type=refresh_token&refresh_token=<refresh_token>
Authorization: Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)
```

- Documented as "Refresh access token". The docs list `authorization_code` as giving "New access
  and refresh tokens" and do **not** say whether a refresh returns a new refresh token.
  Rule for the code: if the answer has a `refresh_token`, store it and drop the old one.
- Whether old refresh tokens stop working after a refresh: **not documented**.
- Whether the refresh token JWT has an `exp` claim: likely (it is a JWT with an "exp token
  attribute"), but **unverified**. Read it if present, never rely on it.
- Form body versus query string: as in 2.3, **unverified**.

### 2.5 Access token claims

| Claim | Notes |
| --- | --- |
| `user` | custom claim, "the authorizing user's Suunto app account username" (documented). Use it as the stable user id and to match webhooks (`username`). |
| `exp` | expiry, seconds since the epoch (documented) |
| others | not documented. Do not depend on them. |

Read the claims without checking the signature only to get `user` and `exp`: the token comes
straight from Suunto's token endpoint over TLS. The signing key is not documented.

### 2.6 Deauthorize

```
GET https://cloudapi-oauth.suunto.com/oauth/deauthorize?client_id=<CLIENT_ID>
Authorization: Bearer <access token>
```

- "Disconnect user from partner service" (documented). 200 with an empty body on success; 400 on
  error.
- Call it when a user disconnects Suunto in our app. What happens to the refresh token afterwards,
  and whether Suunto tells us when the user disconnects on the Suunto side: **not documented**.

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

#### GET `/247samples/activity?from={from}&to={to}`

"Daily steps, energy consumption (in joules), HR data and SpO2 based on sample values from the
watches." `from` and `to`: integers, epoch milliseconds, both required. Example call:
`/247samples/activity?from=1672524000000&to=1690837200000`.

Answer (`DailyActivityEntryDataArray`, documented example):

```json
[
  {"timestamp": "2019-02-11T12:00:00Z",
   "entryData": {"HR": 72, "StepCount": 100, "EnergyConsumption": 8000, "SpO2": 0.5,
                 "Altitude": 50, "HRExt": {"Min": 60, "Max": 80}, "HRV": 12}},
  {"timestamp": "2019-02-11T12:10:00Z",
   "entryData": {"HR": 65, "StepCount": 50, "EnergyConsumption": 5000, "SpO2": 0.3,
                 "Altitude": 10, "HRExt": {"Min": 60, "Max": 80}, "HRV": 12}}
]
```

| Field | Type | Unit and notes (schema) |
| --- | --- | --- |
| `timestamp` | string | ISO 8601 "having also the local time offset from UTC (`yyyy-MM-ddTHH:mm:ss.fffzzz`)". Examples: `2019-02-11T12:00:00Z`, `2024-12-10T14:50:00.000+02:00` (webhook). |
| `HR` | float | average heart rate, bpm |
| `StepCount` | int | schema: "Accumulated steps". The example (100, then 50) is not a running day total, so it is most likely the steps of the sample period (unverified). |
| `EnergyConsumption` | float | **joules** (per sample period, same remark as `StepCount`) |
| `SpO2` | float | oxygen saturation as a **fraction 0..1** |
| `Altitude` | float | metres |
| `HRExt` | object | `{"Min": float, "Max": float}`, bpm |
| `HRV` | int | ms |

Every field may be missing in a sample (unverified; webhook samples carry only `HR`,
`StepCount`, `EnergyConsumption`). The sample interval is not documented (10 minutes in the
example).

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
| `BodyResourcesInsightId` | int | "TODO" in the schema; may be null |
| `SleepId` | int64 | "TODO" in the schema; may be null. Webhook example: `1736112540`. |
| `BedtimeStart`, `BedtimeEnd` | string | ISO 8601 |
| `MaxSpo2` | float | fraction 0..1 |
| `Altitude` | float | metres |
| `AvgHRV` | float | ms, average during the segment |
| `AvgHRVSampleCount` | int | number of HRV samples behind `AvgHRV` |
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
| `Balance` | float | "Body's energy level between 0.0 and 1.0" |
| `StressState` | int | Invalid (0), Relaxing (1), Active (2), Passive (3), Stressful (4) |

The sample interval is not documented (one hour in the example).

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

How the day boundaries are chosen (the example starts at 02:00): **not documented**.

### 3.3 SUUNTO DAILY ACTIVITY API (`/247`)

One operation, the same as 3.2's statistics:

```
GET https://cloudapi.suunto.com/247/daily-activity-statistics?startdate={startdate}&enddate={enddate}
```

Same parameters, rules (UTC, 28 days, once a day), answer and errors as
`/247samples/daily-activity-statistics`. Whether the two return the same data, and which one
Suunto prefers, is **not documented**. Prefer `/247samples`.

### 3.4 SUUNTO WORKOUT API v3 (`/v3/workouts`)

#### GET `/v3/workouts` (list)

"Get list of workouts for the authenticated user."

| Query parameter | Type | Default | Notes (documented) |
| --- | --- | --- | --- |
| `since` | int, epoch ms | `0` | minimum timestamp, **inclusive** |
| `until` | int, epoch ms | now | maximum timestamp, **exclusive** |
| `limit` | int | `50` | maximum number of workouts. Server maximum: not documented. |
| `offset` | int | `0` | workouts to skip |
| `filter-by-modification-time` | bool | `true` | `true`: `since`/`until` filter on **modification time**; `false`: on **workout start time** |

Example call (documented): `/v3/workouts?since=1709251200000&until=1711929600000&limit=10&offset=0`
"would return list of 10 last modified workouts between 2024-03-01T00:00:00Z and
2024-04-01T00:00:00Z". The sort order is **not documented**.

Answer: envelope with `payload` = list of workouts (section 3.4.3) and `metadata`. Documented
example (shortened; the original text is not valid JSON, it starts with `[{{`):

```json
{"error": null,
 "payload": [{"activityId": 11, "startTime": 1526196562327, "totalTime": 2686.03,
   "totalDistance": 3900.0, "totalAscent": 88.75, "totalDescent": 128.52,
   "startPosition": {"x": 23.842736666666667, "y": 61.453113333333334},
   "stopPosition": {"x": 23.844015, "y": 61.45330166666667},
   "centerPosition": {"x": 23.831098333333333, "y": 61.45186},
   "maxSpeed": 2.6, "recoveryTime": 0, "cumulativeRecoveryTime": 0,
   "rankings": {"totalTimeOnRouteRanking": {"originalRanking": 1, "originalNumberOfWorkouts": 1}},
   "extensions": [{"type": "SummaryExtension", "pte": 2.0, "feeling": null, "avgTemperature": 302.44998,
     "maxTemperature": null, "peakEpoc": 14.5, "avgPower": null, "maxPower": null,
     "avgCadence": 0.9801348, "maxCadence": null, "ascentTime": 1178.0, "descentTime": 1043.0,
     "performanceLevel": null}],
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
`MultisportMarker` without "Extension". Which extensions come back when `extensions` is left out:
**not documented**.

Answer: envelope, `payload` = one workout (3.4.3). Errors: 400, 403 (and 500 for a malformed
key, FAQ).

#### GET `/v3/workouts/{workoutIdOrKey}/fit` (FIT export)

`workoutIdOrKey`: "Workout identifier (workoutKey)". Answer: `application/octet-stream`, "User
workout data in Garmin FIT format". Errors: 400, 403, 404. The FAQ: "Fit files has most
comprehensive dataset from each workout", with all samples, laps and summary values. The FIT
content is described on `/fit-description` (session, lap, record, length, event, dive messages and
Suunto developer fields). MCP for Suunto v1 does not parse FIT.

#### 3.4.3 Workout object (`LimitedWorkout`)

Same schema in v2 and v3 (the two schema files are identical).

| Field | Type | Unit and notes |
| --- | --- | --- |
| `workoutKey` | string | "Workout unique id". 24 hex characters. |
| `key` | string | "Workout key" (relation to `workoutKey` not documented) |
| `workoutId` | int32 | not described |
| `workoutName` | string | |
| `description` | string | |
| `activityId` | int32 | Suunto App activity id (section 8) |
| `startTime`, `stopTime` | int64 | **epoch milliseconds**. The schema text says "seconds since Epoch", but the FAQ says "UNIX epoch milliseconds" and the examples (`1526196562327`, webhook `1702729200000`) are milliseconds. |
| `timeOffsetInMinutes` | int32 | "Timezone offset in minutes. 0 for UTC." FAQ: the user's local time difference to UTC "at the time when the exercise stopped". Local time = UTC + offset. |
| `created` | int64 | unit not documented |
| `totalTime` | double | **seconds** |
| `totalDistance` | double | **metres** |
| `totalAscent`, `totalDescent` | double | unit not documented (example `88.75`; metres, unverified) |
| `maxAltitude`, `minAltitude` | float | unit not documented (metres, unverified); barometer or GPS |
| `avgSpeed`, `maxSpeed` | double / float | The schema text says **km/h**. Both examples fit **m/s**: 3900 m in 2686.03 s is 1.45, the value given; webhook: 10000 m in 3600 s, `avgSpeed` 2.78. Treat as m/s (unverified). |
| `avgPace` | double | unit not documented. Example `11.48` matches minutes per km for 1.45 m/s (unverified). |
| `energyConsumption` | int32 | **kcal** (schema) |
| `recoveryTime` | int64 | seconds |
| `cumulativeRecoveryTime` | int64 | seconds |
| `stepCount` | int32 | steps |
| `cadence` | float | schema: a number, "round per minute" average. The list example has an object `{"max": 0, "avg": 0}`. Accept both. |
| `hrdata` | object | `userMaxHR` (user max HR at the time), `workoutAvgHR`, `workoutMaxHR`, all bpm. The list example also has `hrmax`, `max`, `avg`. |
| `startPosition`, `stopPosition`, `centerPosition` | `{"x": double, "y": double}` | **x = longitude, y = latitude**. Not stated for workouts; the POI schema states it for the same `x`/`y` shape, and the workout examples (x 23.84, y 61.45 in Finland) fit. |
| `extensionTypes` | string[] | which data the workout has. Enum: `SKI`, `MULTISPORTMARKER`, `SUMMARY`, `EPOCSTREAM`, `VERTICALSPEEDSTREAM`, `CADENCESTREAM`, `DEPTHSTREAM`, `POWERSTREAM`, `SEALEVELPRESSURESTREAM`, `STROKERATESTREAM`, `SWOLFSTREAM`, `TEMPERATURESTREAM`, `SWIMMINGHEADER`, `INTENSITY`, `FITNESS`, `HEARTRATE`, `ALTITUDESTREAM`, `HEARTRATESTREAM`, `LOCATIONSTREAM`, `SPEEDSTREAM`, `PAUSEMARKER`, `MANUALLAP`, `INTERVAL`, `VERTICALLAP`, `DISTANCEDELTA`, `STEPCOUNTDELTA`, `STROKESDELTA`, `SKITURN`, `SKIHEADER`, `APPBUNDLEID` |
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

- The list takes the same query parameters and gives the same answer as v3 (documented).
- The workout schema is identical to v3.
- Differences to v3: v2 has **no `extensions` query parameter**; v2 "get" includes location
  points, and `/summary` leaves them out. How location points appear in the JSON is **not
  documented**.
- The how-to-start example still calls `/v2/workouts`. New code uses v3.

### 3.6 SUUNTO WORKOUT DESCRIPTION API (`/v1/workouts`)

```
POST https://cloudapi.suunto.com/v1/workouts/addinfo/{workoutId}
```

- "Add additional info to workout description." `workoutId`: string, "ID of the workout to be
  modified" (whether the key or the numeric id: not documented).
- **The request body is not documented** (no schema, no example).
- Answer: 200 `application/json` (body not documented). Errors: 400, 403, 500.
- Not used by MCP for Suunto v1.

### 3.7 SUUNTO ROUTE API (`/v2/route`)

| Operation | Method and path | Answer |
| --- | --- | --- |
| List routes | `GET /v2/route` | JSON list of `PartnerRoute` |
| Get route | `GET /v2/route/{oid}` | `PartnerRoute` |
| Export GPX | `GET /v2/route/{oid}/export` with `Accept: application/gpx+xml` | GPX |
| Import GPX | `POST /v2/route/import?activities=1,2` with a GPX body | 200 `application/json` (body not documented) |
| Update | `PUT /v2/route/{oid}` with `Content-Type` and `Accept: application/gpx+xml` | updated GPX |

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
| `activityIds` | Suunto App activity ids; the schema enum is 0..93 |
| `startPoint`, `centerPoint`, `endPoint` | `{altitude, latitude, longitude}` (altitude unit not documented) |
| `created`, `modified` | epoch ms (example only) |
| `averageSpeed` | unit not documented (m/s, unverified) |
| `totalDistance` | unit not documented (metres, unverified) |
| `watchEnabled`, `turnWaypointsEnabled` | bool |

GPX rules (documented on `/route-description`):

- Import: routes from `rte` or `trk` elements; **each `rte`/`trk` becomes a separate route**.
  Imported per point: latitude, longitude, elevation, name, type.
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
  `Valley`, `Water`, `Water_point`, `Waterfall`, `Waypoint`, `Wreck`.
- Watches may shorten names and drop characters they cannot show.
- Export GPX uses the namespace `xmlns:suunto="http://www.suunto.com/xmlschemas/RouteExtension/v1"`
  with `metadata/extensions/suunto:route` holding `suunto:id`, `suunto:revision` (for example
  `1791291783072`), `suunto:activityIds/suunto:activityId` and `suunto:turnWaypointsEnabled`;
  route points may carry `extensions/suunto:routePoint` with `suunto:name`, `suunto:type`,
  `suunto:description`.

Update rules (documented): first export the GPX, edit it, then PUT it. The GPX must contain
`suunto:id` (equal to `oid`) and the current `suunto:revision`. A stale revision gives **409**
("Fetch the latest GPX ... and retry"). 400: invalid GPX, missing id or revision, id mismatch, or
not exactly one route. 403: no permission. 404: route not found. The answer is the full GPX with a
new revision. The description shows the URL `https://cloudapi-partner.suunto.cn/v2/route/{oid}`;
on the global API the path is `https://cloudapi.suunto.com/v2/route/{oid}` (unverified).

Errors for list, get and export: 400, 401, 403, 404. Import: 400, 403, 500.

### 3.8 SUUNTO POINT OF INTEREST API (`/v2/poi`)

| Operation | Method and path | Body | Answer |
| --- | --- | --- | --- |
| List | `GET /v2/poi?limit={n}&offset={n}` | | list of `PointOfInterestResult` |
| Get | `GET /v2/poi/detail?poiKey={poiKey}` | | `PointOfInterestResult` |
| Create | `POST /v2/poi/create` | `PointOfInterestCreateRequest` | `PointOfInterestResult` |
| Upsert | `PUT /v2/poi/{poiKey}` | `PointOfInterestUpsertRequest` | `PointOfInterestResult` |

- `limit`, `offset`: int32; defaults and maximum not documented.
- There is **no delete** operation.
- Rules (documented): `watchEnabled` must be `true`; `point.type` must be a `PoiType` value; for
  upsert, `poiKey` in the path must equal `key` in the body. `key` is optional on create.
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
| `pointOfInterest.key` | unique key |
| `point.x` | **longitude** (schema) |
| `point.y` | **latitude** (schema) |
| `point.z` | altitude (unit not documented) |
| `point.name` | string |
| `point.type` | `PoiType` int, below |
| `activityId` | Suunto activity id |
| `country`, `locality` | strings |
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
   fields optional:

   | Field | Type | Notes |
   | --- | --- | --- |
   | `description` | string | workout description |
   | `comment` | string | "use it as notes" |
   | `notifyUser` | bool | default `true`; push notification to the user. Set `false` for bulk uploads. |
   | `privacy` | string | `DEFAULT`, `PRIVATE`, `FOLLOWERS` or `PUBLIC`; `DEFAULT` or missing uses the user's default (how-to page only; not in the schema) |

   Answer (`Upload`): `id`, `url` (an Azure Blob SAS URL), `headers` (`{"x-ms-blob-type": "BlockBlob"}`),
   `method` (`"PUT"`), `description`, `comment`, `dataType` (`"FIT"`), `notifyUser`, `curlString`
   (for testing only; "do not use it in your application"). Errors: 400, 403, 422 (wrong
   parameters, for example an unsupported data type).
2. **Upload**: send the FIT file with the given `method` (PUT), `url` and `headers`. Azure answers
   **201 Created**. Only FIT is supported. How long the URL stays valid: not documented.
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
- Errors on create, update, download and delete: 400 invalid guide
  (`{"error": {"description": "Invalid step type: 'notfication'"}, "payload": null, "metadata": {"ts": "1621925931041"}}`),
  403, 404 (does not exist, other user, or created by another partner), 409 (the user already has
  a guide with the same `externalId`). List: 403.
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
  `"notification"`). Follow the reference.
- Watches render only a minimum character set reliably. Guides work on Suunto 3, 5 and 9
  families (page text).

Not used by MCP for Suunto v1.

---

## 4. Webhooks

MCP for Suunto v1 does not use webhooks. Short facts for later (documented on `/webhooks`):

- Set the notification URLs and a **notification secret** in the OAuth app settings. Routes have
  their own "Route Notification Url".
- Types (`type` field): `WORKOUT_CREATED`, `ROUTE_CREATED`, `SUUNTO_247_ACTIVITY_CREATED`,
  `SUUNTO_247_SLEEP_CREATED`, `SUUNTO_247_RECOVERY_CREATED`. The page says "three types" but lists
  five.
- Every JSON body has `type` and `username` (the `user` claim of section 2.5).
  - Workout: `workout` (the workout object of 3.4.3, for example `workoutKey`, `activityId`,
    `startTime` ms, `totalTime`, `energyConsumption`, `startPosition`, `stepCount`,
    `totalAscent`, `totalDescent`, `totalDistance`, `hrdata`, `avgSpeed`, `maxSpeed`,
    `timeOffsetInMinutes`) and `gear` (`{"manufacturer": "Suunto", "name": "Suunto Vertical", "productType": "SPORT_WATCH"}`).
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

No unit is documented. Readings (all **unverified**):

| Field | Likely meaning and unit | Why |
| --- | --- | --- |
| `pte` | peak training effect | FIT `total_training_effect` is "PeakTrainingEffect" |
| `feeling` | 1 (worst) to 5 (best) | FIT developer field `feeling`, range 1-5 |
| `avgTemperature`, `maxTemperature` | **kelvin** | `302.44998` is 29.3 degrees C; as Celsius it would be impossible on a wrist |
| `peakEpoc` | EPOC peak | FIT field `peak_epoc` (documented there with unit "l/kg") |
| `avgPower`, `maxPower` | watts | FIT power fields |
| `avgCadence`, `maxCadence` | **Hz** (revolutions or step pairs per second) | `0.98` per second is 59 per minute; guide targets use Hz for cadence |
| `ascentTime`, `descentTime` | seconds | `1178 + 1043` is below `totalTime` 2686.03 |
| `performanceLevel` | unknown | |

### 5.2 Undocumented extensions

The JSON format of **every other extension in the list of 3.4 is not documented**. That includes
`DiveHeaderExtension`, `WeatherExtension`, `FitnessExtension`, `IntensityExtension`,
`SkiExtension`, `SwimmingHeaderExtension`, `HeartRateExtension`, the lap and marker extensions,
and all 22 `...StreamExtension` types (for example `HeartrateStreamExtension`). The format of
stream points is not documented either.

Rules for the code: request extensions by name, pass unknown objects through as they are, never
assume a unit, and treat every field as optional. Record real shapes in this file once seen.
For dive data the documented source is the FIT file (`/fit-description`: `max_depth` and
`avg_depth` in metres, `surface_interval` in seconds, `dive_mode`, gas messages with
`oxygen_content` and `helium_content` percent, `gf_low`, `gf_high`).

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
13. A wrong workout key gives **500**, not 404. Check the key format (24 hex characters) first.
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
21. The FAQ is partly outdated (sleep, POI, webhooks for daily data).

---

## 7. Open questions

These need a real account and a real call.

1. **Q1 Authorize.** Is `state` passed back? Is `scope` accepted, with values other than
   `workout`? What does the redirect carry when the user refuses?
2. **Q2 Token request.** Form body or query string (or both)? Exact 400 and 401 bodies?
3. **Q3 Refresh.** New refresh token on refresh? Does the old one stop working? Refresh token
   lifetime, and does it carry `exp`?
4. **Q4 `user`.** Is there a `user` field in the token answer, or only the claim? Other claims?
5. **Q5 Deauthorize.** Effect on tokens; any notice when the user disconnects in the Suunto App?
6. **Q6 Limits.** Production rate limits; is the Developer limit per key; status and body when a
   limit is hit (Azure API Management usually sends 429)?
7. **Q7 Bearer.** Is the `Bearer` prefix required, or is the raw token accepted too?
8. **Q8 Workout list.** Sort order, maximum `limit`, meaning of `metadata.workoutcount` and
   `metadata.until`; does the list include `extensions`?
9. **Q9 Units.** `avgSpeed`/`maxSpeed` (km/h or m/s), `avgPace`, `totalAscent`, altitudes,
   `created`, route `averageSpeed` and `totalDistance`, POI `creation`.
10. **Q10 Extensions.** Defaults of `GET /v3/workouts/{key}`; JSON format and units of every
    extension, stream point format, `extensionTypes` to name mapping.
11. **Q11 v2 location points.** How do they appear in `/v2/workouts/{key}`?
12. **Q12 247 samples.** Interval; per-sample or cumulative `StepCount`/`EnergyConsumption`;
    missing fields; day boundaries of daily statistics (local or UTC); `Value` number or string?
13. **Q13 Sleep.** Which date a sleep belongs to; meaning of `SleepId`, `BodyResourcesInsightId`.
14. **Q14 `/247` versus `/247samples`.** Same daily statistics data?
15. **Q15 addinfo.** Request body of `POST /v1/workouts/addinfo/{workoutId}`; key or numeric id?
16. **Q16 Routes.** Import answer body; `sort` field; maximum `size`; values of `visibility`.
17. **Q17 POI.** List defaults and maximum; meaning of `errorCode`; any way to delete.
18. **Q18 Upload.** Validity of the upload URL; is `privacy` accepted?
19. **Q19 Error bodies.** Shape of 400, 401, 403 and 500 answers per API; does an expired
    access token give 401 or 403?
20. **Q20 Workout ids.** Relation of `workoutKey`, `key` and `workoutId`; does FIT export accept
    the numeric id ("workoutIdOrKey")?

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
