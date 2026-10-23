# Proxy SDK usage guide

[中文](guide_zh.md) · [Quick start](../README.md)

## Methods

Each method returns validated API `data`, preserving extra result fields. All routes are relative to `baseUrl + /api/v1/api`.

| Method | Route | Result |
|---|---|---|
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | One page of `Channel[]` |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | Active matches as `Channel[]`; `[]` if absent |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean` |

Empty lists and boolean false are valid results, not fabricated successes or exceptions. Creation uses HTTP 201 with application code 200. SDK result validation does not establish account entitlements or product availability.

## Proxy generation

Use an existing channel ID and permitted region/gateway values from your Nstdata account. The snippets below reuse `client` from the quick start; run only the operation you intend. Set `NSTDATA_CHANNEL_ID` locally when needed.

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

`listChannels` reads only the requested page. Optional inputs are `page`, `pageSize`(1–100), `type`, `regionType`(`country`/`state`/`city`), `status`(0–4), `createType`(`package`/`balance`) and search text `s`.

The service defaults to 50 items and descending creation time. No total count or next-page cursor is returned. Page lengths alone do not guarantee a stable snapshot while channels change; choose an explicit page limit when iterating.

`getChannel(id)` returns an array rather than a single object. An empty array means no matching active channel. Records may include passwords and extra fields; use the exported `Channel` type and select what the application needs.

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
| `baseUrl` | `https://api.nstdata.io`; HTTPS origin with no credentials/path/query/fragment. HTTP is permitted only on loopback. |
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

HTTP/API failures expose `statusCode`; application errors also expose `applicationCode`. Error messages exclude raw bodies, credentials, transport details and cancellation reasons. Generation/write outcomes can be uncertain after transport failure: inspect actual state before deciding on another call.

The scope is the six customer methods above. Reseller `/api/v1/service`, Dashboard sessions, ISP purchasing/renewal and framework integrations use separate contracts. Keep keys, proxy URLs and channel records out of published examples and logs.
