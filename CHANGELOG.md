# Changelog

## 1.1.0

- Add account balance, product catalog and supported-country queries.
- Add read-only setup previews and single/batch proxy helpers with live defaults and dedicated-channel reuse.
- Coordinate default-channel creation within a client; reconcile uncertain creation without blind retries.
- Add the standalone `nstdata-proxy` CLI with hidden key input, explicit confirmation and private file export.
- Preserve the six existing customer API methods and their input contracts.

## 1.0.0

- Customer proxy generation and channel list, detail, create, update and delete methods.
- Bounded response reading, request deadlines, cancellation and sanitized errors; no automatic retries or redirects.
- ESM exports, TypeScript declarations and offline installed-package verification.
- Reject malformed Unicode text before query encoding or submission; preserve valid Unicode input.
- Add bilingual feature guides and verify their snippets against an installed package.
