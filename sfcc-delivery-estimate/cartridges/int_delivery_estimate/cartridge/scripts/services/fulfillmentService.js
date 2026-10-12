'use strict';

/**
 * Fulfilment service wrapper (Service framework, HTTP + Basic auth).
 * URL / user / password live in the service credential (BM), never in code.
 * Timeout, rate limit and circuit breaker live in the service profile (BM).
 */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger').getLogger('deliveryEstimate', 'deliveryEstimate');

var SERVICE_ID = 'delivery.fulfillment.http';
var VALID_TIERS = ['SAME_DAY', 'NEXT_DAY', 'STANDARD'];

/**
 * Deterministic tier for mock mode (service set to "mock mode" in BM).
 * @param {string} sku - sku
 * @returns {string} tier
 */
function mockTier(sku) {
    var s = String(sku);
    return VALID_TIERS[s.charCodeAt(s.length - 1) % VALID_TIERS.length];
}

var service = LocalServiceRegistry.createService(SERVICE_ID, {
    createRequest: function (svc, args) {
        var base = String(svc.getURL()).replace(/\/+$/, '');
        svc.setURL(base + '/fulfillment?sku=' + encodeURIComponent(args.sku) + '&country=' + encodeURIComponent(args.country));
        svc.setRequestMethod('GET');
        svc.setAuthentication('BASIC'); // sends Authorization: Basic base64(user:password)
        svc.addHeader('Accept', 'application/json');
        return null;
    },
    parseResponse: function (svc, client) {
        return JSON.parse(client.text);
    },
    mockCall: function (svc, args) {
        return {
            statusCode: 200,
            statusMessage: 'OK',
            text: JSON.stringify({ sku: args.sku, country: args.country, tier: mockTier(args.sku) })
        };
    },
    filterLogMessage: function (msg) {
        return String(msg).replace(/Authorization:[^\n]*/gi, 'Authorization: ***');
    }
});

/**
 * Calls the fulfilment service.
 * @param {string} sku - variant sku
 * @param {string} country - ISO 3166-1 alpha-2 code
 * @returns {string} one of SAME_DAY | NEXT_DAY | STANDARD
 * @throws {Error} on any failure (timeout, 4xx/5xx, open circuit, bad payload)
 */
function getTier(sku, country) {
    var result = service.call({ sku: sku, country: country });
    if (!result.ok) {
        throw new Error('Fulfilment service failed: status=' + result.status +
            ' error=' + result.error + ' msg=' + result.errorMessage);
    }
    var tier = result.object && result.object.tier ? String(result.object.tier).toUpperCase() : '';
    if (VALID_TIERS.indexOf(tier) === -1) {
        Logger.warn('Unknown tier "{0}" for sku {1}', tier, sku);
        throw new Error('Unknown tier returned: ' + tier);
    }
    return tier;
}

module.exports = { getTier: getTier, VALID_TIERS: VALID_TIERS };
