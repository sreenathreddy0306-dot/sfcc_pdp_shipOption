# PDP Delivery Estimate (SFRA)

On the PDP, when the selected variant is **In Stock**, the storefront asks an external fulfilment
service for a delivery tier (`SAME_DAY`, `NEXT_DAY`, `STANDARD`) and renders a brand-managed
content block below the availability info. Card design follows the supplied references (see `docs/preview.html`). Montserrat, responsive, accessible, cached, and fail-safe: a slow/failing service can never block or break the PDP.

* Technical doc: [`docs/TECHNICAL.md`](sfcc-delivery-estimate/docs)
* Business doc (content editing, on/off switch): [`docs/BUSINESS_GUIDE.md`](sfcc-delivery-estimate/docs)



## How it works (short)

```
PDP (cached) ──renders content ──▶ data-pid/country
   browser JS ── GET DeliveryEstimate-Show?pid&country ──▶ controller
        sessionStorage memo + in-flight dedupe       │ (checks flag, variant, IN_STOCK)
                                                     ├─ custom cache (10 min hit / 1 min failure)
                                                     ├─ Service framework → fulfilment API (Basic auth, 1.5 s timeout, circuit breaker)
                                                     └─ Content asset per tier (BM-editable) → HTML fragment (page-cacheable)
```
Service failure → neutral **fallback** content asset (or nothing). The PDP itself never waits on the service.

## Install

1. Add `int_delivery_estimate` to the site cartridge path **before** `app_storefront_base`
   (e.g. `int_delivery_estimate:app_storefront_base`) — BM → Administration → Sites → Manage Sites → *site* → Settings.
2. Build the client assets (note: the root `package.json` `name` must equal the cartridge folder, `int_delivery_estimate` - `sgmf-scripts` derives the cartridge path from it) (the repo is self-contained; it does not need the SFRA source to compile):
   ```
   npm install
   npm run compile        # = compile:js + compile:scss
   ```
   Output: `cartridges/int_delivery_estimate/cartridge/static/default/js/deliveryEstimate.js` and `.../css/deliveryEstimate.css`
   (the template loads them with `assets.addJs/addCss`). Then upload the cartridge with your usual tooling
   (`sgmf-scripts --upload`, Prophet, etc.). `static/` is git-ignored: build it in CI/locally, don't commit it.
3. Import the site template: zip `metadata/delivery_estimate_site_template` (folder as top-level; prebuilt zip is provided) and import via
   BM → Administration → Site Development → **Site Import & Export**. Rename `sites/RefArch` to your site ID if different.
   The template also ships the truck photo (cropped from your reference images, ~290x466 px, so swap in a hi-res asset for production).
4. BM → Administration → Operations → **Services** → credential `delivery.fulfillment.cred`:
   set URL (mock base URL, no trailing path), user, password.
5. BM → Merchant Tools → Site Preferences → Custom Preferences → **Delivery Estimate**:
   tick `deliveryEstimateEnabled`. Invalidate the page cache (BM → Site → Cache) so cached PDPs render the slot.

### Cartridge not detected?

| Where | Cause / fix |
|-------|-------------|
| VS Code Prophet / UX Studio doesn't list or upload it | The folder needs a `.project` file (included at `cartridges/int_delivery_estimate/.project`). Open the **repo root** as the workspace, copy `dw.json.sample` to `dw.json`, fill it in, reload the window. |
| `npm run uploadCartridge` | Needs `dw.json` in the repo root (hostname, username, password/access key, code-version). |
| Not on the storefront | BM → Administration → Site Development → **Code Deployment**: make sure the code version containing `int_delivery_estimate` is **Active**. Then BM → Sites → Manage Sites → *site* → Settings → cartridge path must read `int_delivery_estimate:app_storefront_base` (exact name, colon-separated, no spaces) and be saved for the correct site. |
| Uploaded folder layout | On the server it must be `<code version>/int_delivery_estimate/cartridge/...` (the folder holding `cartridge/`, `package.json`, `caches.json`), not the repo root. |
| Static files 404 | Run `npm run compile` before uploading; `static/` isn't committed. |

## Mock service

* **Beeceptor:** create `https://<name>.free.beeceptor.com`, add rules on `GET /fulfillment` with query
  `sku = <exact sku>` returning `{"sku":"…","country":"US","tier":"SAME_DAY"}` (one rule per tier); for the
  resilience SKU add a response delay of 4000 ms, or a 500 response. Enable Basic auth in Beeceptor's auth settings.
* **No network at all:** in BM → Services → `delivery.fulfillment.http` enable **Mock Mode**. The in-code
  `mockCall` returns a tier from the last character of the SKU (no delay). To go live, untick Mock Mode and
  change the credential URL — no code change.

## Test checklist

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Select in-stock variant mapped to each tier | Matching block under availability, Montserrat, no jump |
| 2 | Select out-of-stock / not-fully-selected variant | No block, no network call |
| 3 | `SLOW` SKU | Skeleton, then **fallback** block after ~1.5 s (service timeout); add-to-cart usable throughout |
| 4 | `FLAKY` / `ERROR` SKU | Fallback block; second view within 1 min does not call the service (see `DeliveryEstimateFailure` cache / log) |
| 5 | Re-select same variant | Instant, no request (sessionStorage memo) |
| 6 | Different shopper, same sku/country within 10 min | No service call (custom cache + page cache) |
| 7 | Edit a content asset in BM | New copy after cache TTL (or after page-cache invalidation); no deploy |
| 8 | Untick `deliveryEstimateEnabled` | No slot, no requests, endpoint returns 204 |
| 9 | Wrong credentials | Fallback block, error logged (`deliveryEstimate` log) |
| 10 | Lighthouse / DevTools Performance | CLS 0 from the block, no render-blocking font |


## Key decisions

* **Server renders the slot, client fetches the fragment** → PDP stays fully cacheable and fast; the service is never in the page's critical path.
* **Country = request locale** (not basket) so the cached PDP never contains per-shopper data; fallback site pref for locales without a country.
* **Content in Content Assets** (copy + images + markup editable in BM) while styling stays in code via tier classes.
* **Layered caching + circuit breaker** (details in TECHNICAL.md).
* **Montserrat** from Google Fonts, non-blocking with `font-display: swap`; self-hosting alternative documented.
