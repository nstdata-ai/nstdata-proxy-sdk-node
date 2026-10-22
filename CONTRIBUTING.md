# Contributing

Use a supported Node.js release and run the development commands in the README before submitting a change. Tests must remain offline; use synthetic credentials and loopback servers.

Keep customer, reseller and Dashboard authentication separate. Changes to routes or payloads need a verified API contract and regression coverage through the public client. Preserve cancellation, response limits, error redaction and the no-retry behavior for operations with uncertain outcomes.

Update declarations, both READMEs and the changelog when public behavior changes. Never commit API keys, proxy credentials or account responses. Run `npm run check:package` to check the contents and behavior of the installable tarball.
