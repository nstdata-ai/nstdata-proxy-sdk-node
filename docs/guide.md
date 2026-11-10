# Proxy SDK usage guide

[中文](guide_zh.md) · [Quick start](../README.md)

[CLI options](#command-line-options) · [Convenient setup](#convenient-proxy-setup) · [API reference](#customer-api-methods) · [Configuration and errors](#configuration-and-errors)

## Command-line options

`nstdata-proxy` runs through npx as shown in the [quick start](../README.md#command-line). For a persistent installation, use `npm install --global @nstdata-ai/proxy`, then run `nstdata-proxy`. Neither mode requires a Node.js project.

| Option | Behavior |
|---|---|
| No options | Interactive setup: hidden key input, selection summary, confirmation, optional private export. |
| `--env <path>` | Load this environment file only. Existing environment values take precedence; no implicit `.env` search. |
| `--dry-run` | Read-only preparation; does not create a channel or generate sessions. |
| `--yes` | Authorize setup and generation without prompts. Required for noninteractive generation. |
| `--channel <id>` | Use only this existing channel. |
| `--type <type>`, `--zone <name>`, `--country <code>` | Require the selected type, catalog product and supported country. |
| `--protocol <http\|socks5>` | Default `http`; SOCKS5 output is a connection string, not a SOCKS5 client. |
| `--duration <minutes>`, `--count <1–1000>` | Defaults: 10 minutes and one connection. |
| `--json` | Suppress interactive prompts; stdout is one JSON result. |
| `--output <path>` | Save complete connections to a new JSON file with mode `0600`. Never overwrite. |
| `--show-url` | Explicitly include credential-bearing URLs in stdout; mutually exclusive with `--output`. |
| `--help`, `-h` | Show usage without a key or API requests. |

File mode `0600` restricts access on POSIX systems; on Windows, use a directory with appropriate access controls.

Set `NSTDATA_API_TOKEN` in the environment or an explicit env file; interactive mode can prompt for it without echoing or storing it. `NSTDATA_TEAM_ID` is optional team context. `NSTDATA_API_BASE_URL` is an advanced API origin override, not a normal setup requirement or a proxy URL. Defaults use the official API.

Default stdout contains selection metadata and `count`; `saved: true` confirms file export. Exported JSON adds a `proxies` array.

Errors go to stderr as `{ error: { code, message } }`, with `statusCode` and integer `applicationCode` when available. Common authentication, permission, rate-limit and service errors also include a short `hint`.

Exit codes: 0 success, 1 API/setup failure, 2 input/configuration assistance, 130 interruption. API configuration errors returned as `ProxyAPIError` use exit 1.

## Convenient proxy setup

| Method | Result and effects |
|---|---|
| `prepareProxy(input?, options?)` | Read-only `ProxyPreparation`: actual product/country, reference price, balance, channel name, `channelAction` (`create` or `reuse`), and `channelId` when known. |
| `getProxy(input?, options?)` | `ProxyConnection`: one complete `url`, selected `channelId`, `type`, `zoneName`, `country`, `protocol`, `sessionDuration`, `priceGB`, and `createdChannel`. May create an SDK default channel. |
| `getProxies(input?, options?)` | Same metadata with `proxies: string[]` instead of `url`; optional `count` (1–1000, default 1). One generation request for the whole batch. |

Shared inputs are optional `channelId`, `type`, `zoneName`, `country`, `protocol` and `sessionDuration`. Only `getProxies` accepts `count`. `prepareProxy` does not reserve resources or prove connectivity. The generated URL contains credentials; pass it to a compatible client rather than logging it.

### Selection rules

1. Read the current account balance and live product catalog. Without a channel ID, use compatible pay-per-use Residential Lite products, then Residential; within each type use reference price and product name as stable tie-breakers.
2. Reuse an active compatible `nstdata-sdk-default` pay-per-use channel before creating one. Other names and package channels are not selected automatically. A caller-specified channel is checked directly and never silently replaced.
3. Honor the requested country or the channel's fixed country. Otherwise prefer US when returned by the country API, then the first supported country code in sorted order. A conflicting fixed country fails; it is not changed.
4. Default to HTTP, one connection and a 10-minute session. Omit gateway selection so the service chooses its default. Session duration is not an IP-stability or uptime guarantee.
5. If needed, create an unrestricted default channel with a cryptographically random password, then generate connections once. Do not rename, reset or delete other channels, purchase packages, or test a destination.

Explicit products must support the selected protocol and country. ISP requires an existing usable channel; buying or renewing ISP resources is outside this helper. A selected package channel with remaining quota can be used without a positive wallet balance. The service has the final decision on entitlement and available resources. `priceGB` is a reference catalog value, not a final billing guarantee.

### Reuse and recovery

Preparation is cached for up to 30 seconds within a `ProxyClient`, with at most 16 selections. Reuse a client for the same account context. Concurrent calls on that client share initialization and default-channel creation, including calls for different countries; they still generate independent sessions. Cancelling one caller does not cancel other waiting callers. `createdChannel` describes shared initialization and is not a per-call creation count.

Coordination does not span client instances, processes or machines; there is no claimed server-side uniqueness guarantee. Retain a confirmed channel ID for deployment across workers. Default-channel discovery stops after five pages of 100; incomplete or repeated pages fail without creating a channel.

Creation and generation are never retried automatically. If a creation response is lost, the same client remembers the uncertain outcome, rereads channels on a later call and uses a confirmed matching channel. If none is found, it returns `CHANNEL_CREATION_UNCERTAIN` rather than creating again. Check the dashboard or pass a confirmed `channelId`; restarting a process is not proof that an earlier creation failed. A generation transport failure returns `PROXY_GENERATION_UNCERTAIN`; inspect the result before requesting another session. Local cancellation does not undo a remote operation.

## Customer API methods

Each method returns validated API `data`, preserving extra result fields. All routes are relative to `baseUrl + /api/v1/api`.

| Method | Route | Result |
|---|---|---|
| `getAccountInfo(options?)` | `GET /user/info` | `AccountInfo`, including numeric `balance` |
| `listPlans(query?, options?)` | `GET /plan/info` | `ProxyPlan[]`; optional product `type` filter |
| `listCountries({ type }, options?)` | `GET /region/country` | `ProxyCountry[]`, using the returned `value` codes |
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | One page of `Channel[]` |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | Active matches as `Channel[]`; `[]` if absent |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean` |

Empty lists and boolean false are valid results, not fabricated successes or exceptions. Creation uses HTTP 201 with application code 200. SDK result validation does not establish account entitlements or product availability.

The catalog returns `name`, `type`, `protocols`, reference `priceGB` and `supports`; country records include `value` and may include `label` or `regionId`. Account context comes from the API key and optional team ID.

## Proxy generation

Use an existing channel ID and permitted region/gateway values from your Nstdata account. The snippets below replace the `getProxy` call, its comment and output statement inside the quick start's `try` block. Run one operation at a time. Add any required `NSTDATA_CHANNEL_ID` or other settings to the same `.env` file.

```js
const generated = await client.generateProxies({
    channelId: process.env.NSTDATA_CHANNEL_ID,
    country: 'US', protocol: 'http', sessionDuration: 10, count: 1,
});
console.log({ count: generated.count });
```

| Input | Constraint |
|---|---|
| `channelId`, `country` | Required nonempty strings; use the account's channel and region values. |
| `protocol` | `http` or `socks5`. |
| `sessionDuration` | Positive integer minutes. |
| `count` | Integer 1–1000; this is a client guardrail, not a claimed service maximum. |
| `state`, `city` | Optional; a city requires state. |
| `asn` | Optional positive integer. |
| `sense`, `gateway` | Optional nonempty strings. |

Generation can create new sessions even though it uses GET. Save returned connections securely; URLs contain credentials. Generating SOCKS5 URLs does not implement SOCKS5 traffic or test connection health. No operation is retried automatically.

## Channel reads

`listChannels` reads only the requested page. Use `page`, `pageSize` (1–100), `type`, `regionType` (`country`/`state`/`city`) and `status` (0–4) to constrain it. For exact channel names or pay-per-use selection, filter the returned rows locally; the setup helpers already do this. Legacy `s` and `createType` inputs remain forwarded for compatibility, but require endpoint support and are not used for automatic channel discovery.

The service defaults to 50 items and descending creation time. No total count or next-page cursor is returned. Page lengths alone do not guarantee a stable snapshot while channels change; choose an explicit page limit when iterating.

`getChannel(id)` returns an array rather than a single object. An empty array means no matching active channel. Records may include passwords and extra fields; use the exported `Channel` type and select what the application needs.

```js
const channels = await client.getChannel(process.env.NSTDATA_CHANNEL_ID);
console.log({ matchingChannels: channels.length });
```


## Channel management

These operations change account state. Execute them independently and retain the created channel ID; an uncertain result must be checked before another submission. A successful creation is not evidence that every proxy product is available to the account.

### Create

Choose an existing `zoneName` and compatible product type. Set `NSTDATA_ZONE_NAME` and a unique `NSTDATA_CHANNEL_PASSWORD` locally; do not put actual passwords in code or logs.

```js
const channel = await client.createChannel({
    name: 'development', password: process.env.NSTDATA_CHANNEL_PASSWORD,
    zoneName: process.env.NSTDATA_ZONE_NAME, type: 'residential',
});
// Persist channel.channelId locally before further operations.
```

Required: `name`, `password`, `zoneName`, `type`. Supported types: `residential`, `residential_lite`, `ipv6`, `datacenter`, `mobile`, `isp`.

### Update

Both `name` and `password` are required. This is not a partial update; explicitly provide the intended values, including a password you are authorized to set.

```js
const updated = await client.updateChannel(process.env.NSTDATA_CHANNEL_ID, {
    name: 'development-updated', password: process.env.NSTDATA_CHANNEL_PASSWORD,
});
console.log({ updated });
```

Creation and update also accept positive integer `limit`, `country`, `state`, `city`, IPv4 `whitelist` and string-array `senses`. Empty whitelist/senses arrays are preserved. Names are limited to 40 UTF-16 code units; passwords require at least eight ASCII letters/digits. Account and product rules remain service-controlled; package-channel regions may not be editable.

### Delete

Deletion soft-deletes the channel. Remaining package quota or expiry rules may prevent it; a missing channel can produce an API error.

```js
const deleted = await client.deleteChannel(process.env.NSTDATA_CHANNEL_ID);
console.log({ deleted });
```

## Configuration and errors

| Constructor option | Default / meaning |
|---|---|
| `apiKey` | Required personal/team key, sent only in `x-api-key`; service or browser-session credentials are rejected. |
| `baseUrl` | Optional API origin; defaults to `https://api.nstdata.io`. Override only for an authorized alternative endpoint or local testing. This is not a proxy gateway address. HTTPS is required except on loopback; credentials/path/query/fragment are not allowed. |
| `teamId` | Optional `x-team-id` context. |
| `timeoutMs` |30000 ms; positive integer up to 2147483647, covering response reading. |
| `maxResponseBytes` |1048576; positive safe-integer cap on decoded response bytes. |

Pass `{ signal: AbortSignal }` as the final method argument. An already-aborted signal sends nothing. Redirects are refused. Unknown inputs, control characters and malformed Unicode text are rejected locally. Local cancellation/deadlines do not cancel a submitted remote operation.

| `ProxyAPIError.code` | Meaning |
|---|---|
| `INVALID_CONFIG`, `INVALID_ARGUMENT` | Invalid client setup or method input. |
| `TIMEOUT`, `ABORTED` | Client deadline or caller cancellation. |
| `NETWORK_ERROR` | Connection or response-reading failure. |
| `HTTP_ERROR`, `API_ERROR` | Unsuccessful HTTP status or failed API envelope. |
| `INVALID_RESPONSE` | Invalid UTF-8/JSON/envelope or method result shape. |
| `RESPONSE_TOO_LARGE` | Response exceeds the configured byte cap. |
| `INSUFFICIENT_BALANCE` | No usable balance or selected package quota. |
| `NO_COMPATIBLE_PLAN`, `COUNTRY_UNAVAILABLE` | The requested/default product or country cannot be resolved. |
| `CHANNEL_UNAVAILABLE`, `CHANNEL_REQUIRED` | Selected channel cannot be used, or the product requires an existing channel. |
| `CHANNEL_DISCOVERY_LIMIT` | Incomplete discovery; supply a confirmed channel ID. |
| `CHANNEL_CREATION_UNCERTAIN`, `PROXY_GENERATION_UNCERTAIN` | The remote operation may have succeeded; no automatic retry. |
| `NO_PROXY_GENERATED` | The API returned an empty proxy list. |

HTTP/API failures expose `statusCode`; application errors also expose `applicationCode`. Error messages exclude raw bodies, credentials, transport details and cancellation reasons. Generation/write outcomes can be uncertain after transport failure: inspect actual state before deciding on another call.

The scope is the customer methods and setup helpers above. Reseller `/api/v1/service`, Dashboard sessions, ISP purchasing/renewal and framework integrations use separate contracts. Keep keys, proxy URLs and channel records out of published examples and logs.
