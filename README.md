# Nstdata Proxy SDK for Node.js

[中文](README_zh.md)

Generate Nstdata proxy connections and manage customer channels. ESM with TypeScript declarations and no runtime dependencies.

## Features

| Capability | Guide |
|---|---|
| Proxy generation | [HTTP/SOCKS5 connection strings and session options](docs/guide.md#proxy-generation). |
| Channel reads | [Page-based lists and active-channel details](docs/guide.md#channel-reads). |
| Channel management | [Create, update and soft-delete channels](docs/guide.md#channel-management). |
| Reliability | [Deadlines, cancellation and safe errors](docs/guide.md#configuration-and-errors). |

## Installation

Requires Node.js 22.18+ within 22.x, or Node.js 24.x.

```sh
npm install @nstdata-ai/proxy@1.0.0
```

`1.0.0` is not published yet. Local installation and development checks are in [Contributing](CONTRIBUTING.md).

## Quick start

Set `NSTDATA_API_TOKEN` to an authorized personal or team API key; teamized accounts require a team key. This example reads one channel-list page.

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

Channel records and proxy URLs can contain passwords. Inspect only fields your application needs; do not print complete results. For inputs, results and operation effects, see the [usage guide](docs/guide.md).

This package calls customer APIs. Proxy network transport, connectivity checks and Proxy Manager are separate capabilities.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changes](CHANGELOG.md) · [MIT license](LICENSE)
