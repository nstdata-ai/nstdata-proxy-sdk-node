# Contributing

Use a supported Node.js release. Tests use synthetic credentials and loopback services; do not invoke real account operations during offline checks.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run check:package
```

## Local installation

Build the archive after checks pass, then install it from a separate application:

```sh
npm pack
npm install /path/to/nstdata-proxy-sdk-node/nstdata-ai-proxy-1.0.0.tgz
```

Package checks use empty npm caches to verify the exact tarball and default npm installation through a loopback registry. They run installed-client regressions, compile TypeScript declarations, and execute the documented Node.js command and guide operations against loopback API fixtures. Markdown checks cover all public documents; package checks execute the quick start and guide operations. Pass a previously built tarball path after `npm run check:package --` to validate that exact archive. Checks verify bilingual programs, documentation links and package bytes; they do not prove public npm availability or deployed API compatibility.

Keep customer, reseller and Dashboard authentication separate. Route/payload changes need source-backed contracts and public-client regressions. Preserve cancellation, response limits, error redaction and no-retry behavior for uncertain outcomes. Keep runtime and declarations aligned and update both language guides and the changelog.

Never commit API keys, proxy credentials or account responses. Report vulnerabilities through the [security policy](SECURITY.md). Live checks and publication require the corresponding authorization.

## Releases

The `Publish npm` workflow is started manually from `main`, with a stable version matching `package.json` and the full commit SHA. It checks the source, builds one archive, and records its integrity. The `npm-production` environment reviewer approves publication of that same archive. Successful publication must pass public integrity and default-install checks.

For an existing npm package, configure [trusted publishing](https://docs.npmjs.com/trusted-publishers/) for this repository, `release.yml` and `npm-production`, permitting `npm publish`. The environment must require a reviewer, allow only the `main` branch and disable administrator bypass. No npm token is needed. Configure a new binding near the next release so its first-use deadline is met.

A new package must exist before trusted publishing can be configured. For its first release, the scope owner publishes the reviewed archive using their own npm login and two-factor authentication, following [npm's public scoped-package instructions](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/). Use trusted publishing for subsequent versions. The workflow refuses to bootstrap an unpublished package.

If publication fails or the outcome is uncertain, inspect the registry version and integrity before taking further action. Do not retry publication blindly or change a published version's contents.
