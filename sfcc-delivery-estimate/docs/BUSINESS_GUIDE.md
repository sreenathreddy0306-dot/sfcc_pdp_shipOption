# Business guide: Delivery estimate on product pages

## What shoppers see
When a shopper picks an **in-stock** size/colour, a box under the stock message shows how fast it can arrive:

| Our delivery partner says | Content asset you edit |
|---------------------------|------------------------|
| Same day | `delivery-estimate-same-day` |
| Next day | `delivery-estimate-next-day` |
| Standard | `delivery-estimate-standard` |
| No answer / error / unknown | `delivery-estimate-fallback` (a safe, generic message) |

Out-of-stock, backorder and pre-order items show nothing.

## Edit the wording or images (no developer needed)
1. Business Manager → **Merchant Tools → Content → Content Assets**.
2. Search for `delivery-estimate`, open the asset.
3. Edit **Body**. Use the rich-text editor; to use an image, insert it from the content library and tick **alt text**.
4. Keep the asset **Online**, then **Apply**.
5. Changes appear within about 10 minutes (immediately after a cache invalidation: *Merchant Tools → Site → Cache*).

Anatomy of a block (each part is one line in the asset's **Source** view):
* icon tile - `de-icon--bolt | truck | box` (pick one)
* small coloured label - `<p class="de-eyebrow">`, headline - `<p class="de-title">`, sub-line - `<p class="de-sub">`
* pill at the bottom - `<p class="de-badge">` with icon `de-badge__icon--clock | calendar | shield`
* photo on the right - `<img class="de-image" src="...">` inside `.de-card__media`

Writing tips
* Change wording by editing the text between the tags only (e.g. the cut-off time in the same-day asset). Keep headline and sub-line short; long text is clipped visually on phones.
* **Swap the photo:** upload an image to the content library (*Merchant Tools → Content → Libraries → Static*), then change the `src` (the editor's image button does this). Use a portrait-ish image (about 4:5 or taller, at least 600 px wide). If the picture carries meaning, give it descriptive `alt` text; if purely decorative, leave `alt=""`.
* Colours (green same-day, blue next-day, grey standard/fallback), fonts, spacing and the card shape are set by the site, so every tier stays on-brand and always in Montserrat.
* Never leave an asset empty or offline: if a tier's asset is empty the generic fallback is shown instead.
* Translate per locale with the locale selector on the asset.
* A static preview of all four blocks is in `docs/preview.html`.

## Turn the feature on or off
BM → **Merchant Tools → Site Preferences → Custom Preferences → Delivery Estimate**
* **deliveryEstimateEnabled** — tick to enable, untick to switch the whole feature off (takes effect within ~1 minute for shoppers).
* **deliveryEstimateCacheMinutes** — how long a message is reused before being re-checked (default 10).
* **deliveryEstimateDefaultCountry** — country used when a storefront locale has no country (e.g. `US`).

## When something looks wrong
| Symptom | Likely cause / action |
|---------|----------------------|
| Always the generic message | Delivery partner unreachable or credentials changed → ask IT to check *Services → delivery.fulfillment.http* and the `deliveryEstimate` log |
| Nothing shows for a product | Product not fully in stock, feature off, or both the tier asset and fallback are offline/empty |
| Old wording still showing | Wait for the cache (≤10 min) or invalidate the cache |
| Wrong language | Add the locale version of the content asset |
