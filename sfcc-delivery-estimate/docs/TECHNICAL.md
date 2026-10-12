# Technical documentation

## 1. Components

| File | Purpose |
|------|---------|
| `controllers/DeliveryEstimate.js` | `DeliveryEstimate-Show` (GET). Returns an HTML fragment (200) or empty 204. Sets page-cache TTL. |
| `scripts/helpers/deliveryEstimateHelper.js` | Prefs, validation, in-stock check, tier cache, content lookup, slot config. |
| `scripts/services/fulfillmentService.js` | Service framework wrapper (`delivery.fulfillment.http`), Basic auth, response validation, mock. |
| `templates/.../product/components/productAvailability.isml` | Override: renders the slot under the availability row (only when enabled and not quick view). |
| `templates/.../deliveryEstimate/block.isml` | Wraps the tier's content-asset body with tier class. |
| `client/default/js/deliveryEstimate.js` | Triggers on variant selection, memoises, dedupes, timeouts, renders states. |
| `client/default/scss/deliveryEstimate.scss` | Responsive layout, skeleton, Montserrat + metric-matched fallback. |
| `webpack.config.js` (repo root) | `sgmf-scripts` build: JS and SCSS bundles are standalone, loaded on the PDP via `assets.addJs/addCss` from the slot template (only when the feature is enabled). |
| `caches.json` | Custom caches `DeliveryEstimateTier` (10 min) and `DeliveryEstimateFailure` (1 min). |

## 2. Flow

1. PDP renders the slot (`data-state=loading` if the initial variant is sellable, else `hidden`) with `data-url`, `data-country`, `data-pid`.
2. On load and on `product:afterAttributeSelect`, JS requests `DeliveryEstimate-Show?pid=<variant>&country=<CC>` only if `readyToOrder && available`.
3. Controller re-validates server-side: flag on, `pid` format, product exists and is a variant/simple product, availability status is **IN_STOCK** (backorder/pre-order excluded), country valid.
4. Tier lookup: tier cache → failure cache → service call. Success is cached 10 min, failure 1 min.
5. Content asset `delivery-estimate-<same-day|next-day|standard>` body is rendered. If the tier asset is missing/offline → `delivery-estimate-fallback`. If that is missing too → 204 (slot hides).
6. Fragment is cached by the platform page cache (`res.cachePeriod`; 1 min for fallback/204).

## 3. Service contract

`GET {credential URL}/fulfillment?sku=<variantId>&country=<CC>` with `Authorization: Basic base64(user:password)`
(`svc.setAuthentication('BASIC')`, credentials from the BM credential). 200 → `{sku,country,tier}`; 400/401/500 → `{error,message}`.
Anything other than 2xx, an unknown tier value, malformed JSON, timeout, rate-limit or open circuit is treated as failure.

## 4. Configuration

**Site preferences** (group *Delivery Estimate*)

| ID | Default | Effect |
|----|---------|--------|
| `deliveryEstimateEnabled` | false | Feature flag. Off: slot not rendered, controller returns 204, no service calls. |
| `deliveryEstimateCacheMinutes` | 10 | HTTP/page-cache TTL of the fragment (1–1440). |
| `deliveryEstimateDefaultCountry` | US | Used when the locale has no country part. |

**Service** `delivery.fulfillment.http` — credential `delivery.fulfillment.cred` (URL/user/password), profile `delivery.fulfillment.profile`:
timeout 1500 ms, rate limit 50/s, circuit breaker opens after 5 failures, 30 s. Tune per environment in BM, no deployment.

**Content assets** (site library; IDs fixed, must be **online**): `delivery-estimate-same-day`, `-next-day`, `-standard`, `-fallback`. Body attribute holds the card markup: `.de-card__main` (icon tile `de-icon--<bolt|truck|box>`, eyebrow, title, sub-line, pill `de-badge` with icon `de-badge__icon--<clock|calendar|shield>`) and `.de-card__media` (right-hand photo, `$staticlink$/delivery-estimate/delivery-truck.jpg`, imported with the site template). Tier accent colour (green / blue / grey) comes from the wrapper class, not from the markup. Localisable per locale.

**Caches** (`caches.json`): TTLs are code-level (cache descriptors are not BM-editable); change and redeploy if needed.

## 5. Resilience matrix

| Failure | Behaviour |
|---------|-----------|
| Service slow (>1.5 s) | Service timeout → fallback block; failure cached 1 min; PDP unaffected (call is async, after page load) |
| Service 4xx/5xx / bad JSON / unknown tier | Same as above, logged to `deliveryEstimate` log |
| Service down repeatedly | Circuit breaker short-circuits calls for 30 s |
| Traffic spike | Rate limit in profile; excess calls fail fast to fallback; caches absorb repeats |
| Fragment request > 3 s / network error | JS aborts, slot hides (collapses), no error thrown |
| Content missing/offline | Fallback asset, else slot hides |
| sessionStorage unavailable | try/catch, just no memo |
| Flag off | Entire feature inert (also protects stale cached PDPs: endpoint 204 → slot hides) |

## 6. Caching layers (repeat views don't hit the service)

1. Browser `sessionStorage` memo (10 min; fallback 1 min) + in-flight de-duplication per `pid|country`.
2. Page cache / CDN on the fragment URL (`pid`+`country`).
3. Custom cache `DeliveryEstimateTier` per `sku|country` (10 min), shared across shoppers.
4. Negative cache `DeliveryEstimateFailure` (1 min) to avoid hammering a failing service.

Content edits become visible after the TTLs expire, or immediately after a page-cache invalidation in BM (browser memo up to 10 min).

## 7. Performance, layout shift, fonts

* No server work added to the PDP render beyond reading prefs; the service call is never on the page's critical path.
* Reserved height (220 px mobile / 240 px desktop, CSS var `--de-h`) from first paint; skeleton → card swap inside the same box = no CLS. The card is `min-height: var(--de-h)` and grows only if copy wraps onto many lines, so keep copy short.
* Montserrat (400/600/700, Latin, `display=swap`) is requested with `media=print`→`all` after the slot exists, so it never blocks rendering; `preconnect` to `fonts.gstatic.com`; metric-adjusted `Montserrat Fallback` (Arial) limits swap shift. Self-hosting alternative: add `woff2` files to the cartridge `static/default/fonts`, declare `@font-face` (+`<link rel="preload" as="font" crossorigin>`) in the SCSS/template, and remove the Google link in `loadFont()`. Check CSP allows `fonts.googleapis.com` / `fonts.gstatic.com` if used.

## 8. Accessibility

`role="status"` + `aria-live="polite"` + `aria-busy`; screen-reader loading text; skeleton `aria-hidden`; colour contrast ≥ 4.5:1 for default styles; reduced-motion respected; images in content must have `alt` (business guide); layout is flex-wrap-safe to 320 px.

## 9. Security

Credentials only in BM (masked); `Authorization` redacted from service logs; `pid`/`country` validated (regex) before use; fragment HTML comes only from trusted BM content assets (access-controlled by BM roles). No PII is sent to the service (sku + country).

## 10. Logging & monitoring

Custom log category `deliveryEstimate` (errors on every lookup failure, warn on unknown tier). Service communication log is off by default; enable temporarily in the service for debugging. Alert on error-rate in the log or Service Status page.

## 11. Known limitations / extension ideas

* Country is locale-based; if shipping country must follow the shopper's chosen address, expose it client-side (cookie/`localStorage`) and pass it as `country` — the endpoint already accepts it.
* Quick view is intentionally excluded.
* Tier TTLs are static; an admin-editable TTL would require a custom job/object.
* Add unit tests with `proxyquire` for the helper (cache hit/miss, failure caching, fallback selection).

## 12. Visual design

Matches the supplied references (icon tile, eyebrow, title, sub-line, pill badge, photo on the right). Deliberate differences: the type is Montserrat (requirement) instead of the sample's condensed face, and accent colours are slightly darker (#2f7d2b, #2679b8, #5c6670) so white-on-colour text and coloured eyebrow text meet WCAG AA. `docs/preview.html` renders all four assets with the production CSS (open in a browser).
