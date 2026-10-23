# Contributing

Use a supported Node.js release. Tests use synthetic credentials and loopback services; do not invoke real account operations during offline checks.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run check:package
```

Before publication, build and install the local package from a separate application:

```sh
npm pack
npm install /PATH/TO/nstdata-ai-proxy-1.0.0.tgz
```

Package checks use an empty npm cache to install the exact tarball, run installed-client regressions, compile TypeScript declarations and execute the quick start and guide snippets against loopback services. Pass a previously built tarball path after `npm run check:package --` to validate that exact archive. Checks verify bilingual programs, documentation links and package bytes; they do not prove public npm availability or deployed API compatibility.

Keep customer, reseller and Dashboard authentication separate. Route/payload changes need source-backed contracts and public-client regressions. Preserve cancellation, response limits, error redaction and no-retry behavior for uncertain outcomes. Keep runtime and declarations aligned and update both language guides and the changelog.

Never commit API keys, proxy credentials or account responses. Report vulnerabilities through the [security policy](SECURITY.md). Live checks and publication require the corresponding authorization.
