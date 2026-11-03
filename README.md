# Nstdata Proxy SDK for Node.js

[中文](README_zh.md)

Generate proxy connections with an API key and available account balance. Use the interactive CLI without a Node.js project, or the ESM SDK in an application. Includes TypeScript declarations; no runtime dependencies.

## Installation

Requires Node.js 22.18+ within 22.x, or Node.js 24.x. To use the SDK:

```sh
npm install @nstdata-ai/proxy
```

## Command line

Run from any directory. Enter your API key at the hidden prompt, review the selected product and country, then press Enter to generate one connection. Choose Advanced to change the product, country or existing channel.

```sh
npx --yes --package=@nstdata-ai/proxy nstdata-proxy
```

For scripts, save your authorized API key from the [Nstdata dashboard](https://app.nstdata.io/) in a local `.env` file. Use the key for the intended personal or team account:

```dotenv
NSTDATA_API_TOKEN=your-api-key
```

Generate one connection and save it to a new private file:

```sh
npx --yes --package=@nstdata-ai/proxy \
  nstdata-proxy --env .env --yes --output proxies.json
```

`--yes` before `--package` accepts npx installation; the second `--yes` authorizes channel setup and proxy generation. `proxies.json` contains a `proxies` array with complete credential-bearing URLs. It is created with mode `0600` and never overwrites an existing file. Normal terminal output contains only metadata; the API key is never saved.

## SDK quick start

Use the same `.env` file. Save this program as `quickstart.mjs`:

```js
import { ProxyClient, ProxyAPIError } from '@nstdata-ai/proxy';

try {
    const client = new ProxyClient({
        apiKey: process.env.NSTDATA_API_TOKEN,
    });
    const proxy = await client.getProxy();
    // Pass proxy.url to your proxy-capable HTTP client; it contains credentials.
    console.log({ country: proxy.country, protocol: proxy.protocol });
} catch (error) {
    if (!(error instanceof ProxyAPIError)) throw error;
    console.error({ code: error.code, statusCode: error.statusCode });
    process.exitCode = 1;
}
```

```sh
node --env-file=.env quickstart.mjs
```

The output shows the selected country and protocol. `proxy.url` is the connection to pass to a proxy-capable client. Generating a connection does not test connectivity; actual proxy traffic is metered.

## Defaults and controls

| Capability | Behavior |
|---|---|
| First use | Finds a compatible `nstdata-sdk-default` channel or creates one using a random password. Other channels are unchanged. |
| Selection | Uses the account catalog: Residential Lite, then Residential; HTTP, one connection, 10-minute session. Uses a fixed channel country, otherwise US if available, then a supported country. |
| Preview | `prepareProxy()` or CLI `--dry-run` shows the setup without creating a channel or generating connections. |
| Explicit control | `getProxy({ country, channelId, ... })`, `getProxies({ count, ... })`, and the existing channel methods. Unsupported explicit choices fail without fallback. |

An API key and balance are sufficient for the normal pay-per-use flow when the account has compatible products and access. Availability and billing remain service-controlled; the SDK does not purchase or renew packages.

[Full guide](docs/guide.md) covers CLI options, results, channel management and recovery.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changes](CHANGELOG.md) · [MIT license](LICENSE)
