# Nstdata Proxy SDK for Node.js

An ESM client for Nstdata customer proxy generation and channel management. Requires Node.js 22.18+ (22.x) or 24.x. Includes TypeScript declarations and has no runtime dependencies.

[中文](README_zh.md)

## Installation

Version 1.0.0 is prepared locally and has not been published to npm. To review it, run `npm pack` in this repository, then install the resulting `.tgz` in your application with `npm install /path/to/nstdata-ai-proxy-1.0.0.tgz`. No extraction is needed.

After 1.0.0 is published:

```sh
npm install @nstdata-ai/proxy@1.0.0
```

## Quick start

Set `NSTDATA_API_TOKEN` to an authorized personal or team API key. Teamized accounts require a team API key. Service credentials (`nst_svc_`) and browser session credentials are not accepted by this client.

```js
import { ProxyClient, ProxyAPIError } from '@nstdata-ai/proxy';

const client = new ProxyClient({
    apiKey: process.env.NSTDATA_API_TOKEN,
    baseUrl: process.env.NSTDATA_API_BASE_URL,
});

try {
    const channels = await client.listChannels({ page: 1, pageSize: 10 });
    console.log({ channelsOnPage: channels.length });
} catch (error) {
    if (!(error instanceof ProxyAPIError)) throw error;
    console.error({ code: error.code, statusCode: error.statusCode });
    process.exitCode = 1;
}
```

Proxy URLs and channel records can contain passwords. Do not log complete results. The SDK sends the API key in `x-api-key`, never in the URL, and does not follow redirects.

## Methods

Routes are relative to `baseUrl + /api/v1/api`. These are customer APIs, separate from the `/api/v1/service` reseller namespace and Dashboard login APIs.

| Method | HTTP route | Result |
| --- | --- | --- |
| `generateProxies(input, options?)` | `GET /proxies` | `{ proxies: string[], count: number }` |
| `listChannels(query?, options?)` | `GET /channels` | `Channel[]` for one page |
| `getChannel(channelId, options?)` | `GET /channel/:channelId` | `Channel[]`; no active match returns `[]` |
| `createChannel(input, options?)` | `POST /channel` | `Channel` |
| `updateChannel(channelId, input, options?)` | `PUT /channel/:channelId` | `boolean` |
| `deleteChannel(channelId, options?)` | `DELETE /channel/:channelId` | `boolean`; server uses soft deletion |

Results are the validated `data` value from the API envelope; additional result fields are preserved. A successful create uses HTTP 201 with application code 200. Empty arrays and boolean `false` are valid results. Malformed results are errors.

- **Generate:** requires `channelId`, `country`, `protocol` (`http` or `socks5`), positive integer `sessionDuration` in minutes and integer `count` from 1 to 1000. The count cap is this client's bound, not a claim about the server's limit. Optional fields: `state`, `city`, `asn`, `sense`, `gateway`; `city` requires `state`. Obtain the channel and supported region/gateway values from your Nstdata account. Generating SOCKS5 URLs does not make this package a SOCKS5 transport.
- **List:** optional `page`, `pageSize` (1–100), `type`, `regionType`, `status` (0–4), `createType` (`package` or `balance`), `s`. The server defaults to 50 items, sorts by creation time descending, and returns no total or next cursor. The SDK fetches only the requested page; it does not enumerate automatically.
- **Create:** requires `name`, `password`, `zoneName`, `type`. Supported types: `residential`, `residential_lite`, `ipv6`, `datacenter`, `mobile`, `isp`.
- **Update:** requires both `name` and `password`; this is not a partial update. Create/update also accept `limit` (positive integer), `country`, `state`, `city`, `whitelist` (IPv4 addresses), `senses` (strings). Names have at most 40 UTF-16 code units; passwords require at least eight ASCII letters/digits. Other account and product restrictions are enforced by the server; package region settings may be fixed.
- **Delete:** explicitly changes channel availability. Package balance/expiry rules can prevent deletion; a missing channel is an error.

Unknown input fields are rejected locally. ISP purchase/renewal, reseller operations, Proxy Manager, scraping and proxy connectivity checks are outside this package's scope.

## Configuration and cancellation

| Constructor option | Default | Meaning |
| --- | --- | --- |
| `apiKey` | required | Personal or team API key |
| `baseUrl` | `https://api.nstdata.io` | HTTPS origin, without credentials, path, query or fragment; HTTP is allowed only for loopback tests |
| `teamId` | omitted | Optional `x-team-id` context |
| `timeoutMs` | `30000` | Positive integer deadline, including response reading; maximum 2147483647 |
| `maxResponseBytes` | `1048576` | Positive integer limit on decoded response bytes |

Every method accepts `{ signal: AbortSignal }` as its final argument. An already aborted signal sends no request. A timeout or cancellation stops local waiting; it does not cancel a submitted remote operation.

There are no automatic retries, including for `GET /proxies`, which generates new sessions. After an uncertain create/update/delete outcome, inspect account state before deciding whether to issue another call.

## Errors

`ProxyAPIError.code` is one of `INVALID_CONFIG`, `INVALID_ARGUMENT`, `TIMEOUT`, `ABORTED`, `NETWORK_ERROR`, `HTTP_ERROR`, `API_ERROR`, `INVALID_RESPONSE`, `RESPONSE_TOO_LARGE`.

`statusCode` is available for unsuccessful HTTP responses and application errors. `applicationCode` is available for an error envelope received with successful HTTP status. Error messages omit raw bodies, credentials, transport errors and cancellation reasons. Caller-provided cancellation is `ABORTED`; the client's own deadline is `TIMEOUT`.

## Development

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run check:package
```

Tests use synthetic responses and loopback servers. Package checks install the exact tarball with an empty npm cache, run the installed-client tests, compile a TypeScript consumer and exercise the quick start against a loopback fixture. These checks do not prove live API compatibility or public npm availability.

See [contribution guidance](CONTRIBUTING.md), [changes](CHANGELOG.md) and [MIT license](LICENSE). Product guidance: [create a channel](https://docs.nstdata.io/docs/quick-start/create-a-channel), [generate proxies](https://docs.nstdata.io/docs/quick-start/generate-proxies).
