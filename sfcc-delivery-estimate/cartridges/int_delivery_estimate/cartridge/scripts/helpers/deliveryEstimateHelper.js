'use strict';

var Site = require('dw/system/Site');
var CacheMgr = require('dw/system/CacheMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var ProductAvailabilityModel = require('dw/catalog/ProductAvailabilityModel');
var ContentMgr = require('dw/content/ContentMgr');
var URLUtils = require('dw/web/URLUtils');
var Logger = require('dw/system/Logger').getLogger('deliveryEstimate', 'deliveryEstimate');

var PID_RE = /^[A-Za-z0-9_\-.]{1,100}$/;
var COUNTRY_RE = /^[A-Za-z]{2}$/;
var SLUGS = { SAME_DAY: 'same-day', NEXT_DAY: 'next-day', STANDARD: 'standard', FALLBACK: 'fallback' };
var FAILURE_CACHE_MINUTES = 1;

/**
 * Site preferences with safe defaults.
 * @returns {Object} prefs
 */
function getPrefs() {
    var site = Site.getCurrent();
    var minutes = parseInt(site.getCustomPreferenceValue('deliveryEstimateCacheMinutes'), 10);
    if (isNaN(minutes) || minutes < 1) { minutes = 10; }
    return {
        enabled: site.getCustomPreferenceValue('deliveryEstimateEnabled') === true,
        cacheMinutes: Math.min(minutes, 1440),
        defaultCountry: String(site.getCustomPreferenceValue('deliveryEstimateDefaultCountry') || 'US').toUpperCase(),
        contentPrefix: 'delivery-estimate'
    };
}

/**
 * @param {string} value - raw country
 * @returns {string|null} upper-cased valid code or null
 */
function normalizeCountry(value) {
    return value && COUNTRY_RE.test(value) ? String(value).toUpperCase() : null;
}

/**
 * Config rendered into the PDP slot. Country comes from the request locale (NOT the basket)
 * so the cached PDP never bakes in per-shopper data.
 * @returns {Object} slot config
 */
function getSlotConfig() {
    var prefs = getPrefs();
    var path = String(request.httpPath || '');
    var isQuickView = path.indexOf('ShowQuickView') > -1;
    var parts = String(request.locale || '').split('_');
    var country = normalizeCountry(parts.length > 1 ? parts[1] : null) || prefs.defaultCountry;
    return {
        enabled: prefs.enabled && !isQuickView,
        country: country,
        url: URLUtils.url('DeliveryEstimate-Show').toString()
    };
}

/**
 * @param {dw.catalog.Product} product - product
 * @returns {boolean} true only for a plain IN_STOCK status (not backorder / preorder)
 */
function isInStock(product) {
    return product.availabilityModel.availabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_IN_STOCK;
}

var NO_CACHE = { get: function () { return undefined; }, put: function () {} };

/**
 * Custom cache lookup that never throws: if the cache descriptor is not registered
 * (caches.json not picked up yet) the feature still works, just without that cache layer.
 * @param {string} id - cache id from caches.json
 * @returns {Object} cache or no-op cache
 */
function getCache(id) {
    try {
        return CacheMgr.getCache(id) || NO_CACHE;
    } catch (e) {
        Logger.warn('Custom cache {0} is not registered (check caches.json + package.json and re-activate the code version): {1}', id, e.message);
        return NO_CACHE;
    }
}

/**
 * Tier lookup with positive (10 min) and negative (1 min) caching.
 * @param {string} sku - sku
 * @param {string} country - country code
 * @returns {string|null} tier or null when unavailable
 */
function getTier(sku, country) {
    var key = sku + '|' + country;
    var tierCache = getCache('DeliveryEstimateTier');
    var failCache = getCache('DeliveryEstimateFailure');

    var hit = tierCache.get(key);
    if (hit) { return hit; }
    if (failCache.get(key)) { return null; }

    try {
        var tier = require('*/cartridge/scripts/services/fulfillmentService').getTier(sku, country);
        tierCache.put(key, tier);
        return tier;
    } catch (e) {
        Logger.error('Delivery tier lookup failed for {0}/{1}: {2}', sku, country, e.message);
        failCache.put(key, true);
        return null;
    }
}

/**
 * @param {string} tierKey - SAME_DAY | NEXT_DAY | STANDARD | FALLBACK
 * @param {Object} prefs - prefs
 * @returns {dw.content.MarkupText|null} body markup of an online content asset
 */
function getBody(tierKey, prefs) {
    var content = ContentMgr.getContent(prefs.contentPrefix + '-' + SLUGS[tierKey]);
    if (!content || !content.online || !content.custom.body || !content.custom.body.markup) { return null; }
    return content.custom.body;
}

/**
 * Builds everything the controller needs, or null when nothing should render.
 * @param {string} pid - variant id
 * @param {string} countryParam - requested country
 * @returns {Object|null} result
 */
function buildResult(pid, countryParam) {
    var prefs = getPrefs();
    if (!prefs.enabled || !PID_RE.test(pid || '')) { return null; }

    var product = ProductMgr.getProduct(pid);
    if (!product || product.master || product.variationGroup || product.productSet || product.bundle) { return null; }
    if (!isInStock(product)) { return null; }

    var country = normalizeCountry(countryParam) || prefs.defaultCountry;
    var tier = getTier(product.ID, country);
    var tierKey = tier || 'FALLBACK';
    var body = getBody(tierKey, prefs);
    if (!body && tier) { // tier content missing/offline -> neutral fallback
        tierKey = 'FALLBACK';
        body = getBody(tierKey, prefs);
    }
    if (!body) { return null; }

    return {
        tier: tierKey,
        slug: SLUGS[tierKey],
        body: body,
        cacheMinutes: tierKey === 'FALLBACK' ? FAILURE_CACHE_MINUTES : prefs.cacheMinutes
    };
}

module.exports = {
    getPrefs: getPrefs,
    getSlotConfig: getSlotConfig,
    buildResult: buildResult
};
