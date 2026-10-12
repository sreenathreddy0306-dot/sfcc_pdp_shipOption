'use strict';

var server = require('server');

/**
 * Returns an HTML fragment (200) or an empty 204.
 * pid + country are in the URL so the fragment is cacheable per variant/country
 * by the platform page cache / CDN.
 */
server.get('Show', function (req, res, next) {
    var helper = require('*/cartridge/scripts/helpers/deliveryEstimateHelper');
    var Logger = require('dw/system/Logger').getLogger('deliveryEstimate', 'deliveryEstimate');
    var result = null;

    try {
        result = helper.buildResult(req.querystring.pid, req.querystring.country);
    } catch (e) {
        var log = e;
        Logger.error('DeliveryEstimate-Show failed: {0}', e.message);
    }

    res.cachePeriodUnit = 'minutes';
    if (!result) {
        res.cachePeriod = 1;
        res.setStatusCode(204);
        res.render('deliveryEstimate/empty');
        return next();
    }

    res.cachePeriod = result.cacheMinutes;
    res.render('deliveryEstimate/block', {
        tier: result.tier,
        slug: result.slug,
        body: result.body
    });
    return next();
});

module.exports = server.exports();
