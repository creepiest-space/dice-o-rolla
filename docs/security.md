# Security guidance

## Trust boundary

The browser demo handles notation as untrusted input. The engine enforces notation length, logical
dice, physical body, and pending queue limits before allocating physics or rendering resources.
Consumers can lower these limits through `DiceEngineOptions.limits`; raising them should follow load
testing on the target devices.

Browser composition uses Web Crypto for initial throw conditions. This makes throws harder to
predict, but a result produced on an end-user device is not authoritative. Competitive play,
rankings, prizes, and wagering require a trusted server-side result. Publicly verifiable fairness
requires a protocol such as commit-reveal in addition to cryptographic randomness.

Event listeners are consumer-controlled code. The typed emitter isolates listener exceptions and
returns them from `emit()` without allowing one listener to interrupt the remaining listeners. Dice
engine lifecycle transitions do not fail when a consumer listener throws.

## Production response headers

Serve the browser bundle over HTTPS with the following baseline headers. Configure them as HTTP
response headers at the CDN, reverse proxy, or hosting platform; an HTML `meta` element cannot
enforce every directive, including `frame-ancestors`.

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

Rapier currently requires WebAssembly compilation, which is why the policy includes
`'wasm-unsafe-eval'`. Do not broaden this to `'unsafe-eval'`. Re-test the production bundle after
upgrading Bun, Rapier, or the bundling pipeline and remove `'wasm-unsafe-eval'` if the deployed
browser matrix no longer requires it.

Add `Strict-Transport-Security` only at an HTTPS origin whose subdomain policy is understood. Add
`Cross-Origin-Embedder-Policy` only after auditing every asset loaded by the embedding application;
it can break cross-origin resources that do not opt in.

## Deployment verification

After building and deploying, verify the final response rather than only the source configuration:

```sh
bun run build
curl --fail --silent --show-error --head https://example.invalid/your-demo/
```

Confirm that:

- the HTML response contains the headers above without a second, conflicting CSP;
- the production bundle initializes Rapier without CSP console violations;
- standard and percentile rolls complete;
- no third-party network requests are made;
- embedding the demo in a foreign-origin frame is rejected;
- an oversized notation and viewport are rejected without allocating their requested resources.

Run `bun audit` against the committed lockfile in routine dependency maintenance. A clean advisory
scan is point-in-time evidence and does not replace review of application logic or CI dependencies.
