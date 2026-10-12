'use strict';

var FONT_URL = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap';
var TTL_MS = 10 * 60 * 1000;
var FALLBACK_TTL_MS = 60 * 1000;
var TIMEOUT_MS = 3000;
var STORE_PREFIX = 'deliveryEstimate:';

var inflight = {};
var seq = 0;

function readStore(key) {
    try {
        var raw = window.sessionStorage.getItem(STORE_PREFIX + key);
        if (!raw) { return null; }
        var entry = JSON.parse(raw);
        if (Date.now() > entry.exp) {
            window.sessionStorage.removeItem(STORE_PREFIX + key);
            return null;
        }
        return entry.html;
    } catch (e) {
        return null;
    }
}

function writeStore(key, html) {
    try {
        var ttl = html.indexOf('data-tier="FALLBACK"') > -1 ? FALLBACK_TTL_MS : TTL_MS;
        window.sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify({ html: html, exp: Date.now() + ttl }));
    } catch (e) { /* storage unavailable: ignore */ }
}

/** Non-blocking Montserrat load (media=print -> all swap), font-display: swap. */
function loadFont() {
    if (document.getElementById('delivery-estimate-font')) { return; }
    var link = document.createElement('link');
    link.id = 'delivery-estimate-font';
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    link.media = 'print';
    link.onload = function () { link.media = 'all'; };
    document.head.appendChild(link);
}

function setState($slot, state) {
    $slot.attr('data-state', state).attr('aria-busy', state === 'loading' ? 'true' : 'false');
    if (state === 'hidden') { $slot.find('.js-delivery-estimate-content').empty(); }
}

/** Resolves with an HTML string ('' = nothing to show). Dedupes in-flight calls + session memo. */
function fetchFragment($slot, pid) {
    var country = $slot.attr('data-country');
    var key = pid + '|' + country;

    var cached = readStore(key);
    if (cached !== null) { return $.Deferred().resolve(cached).promise(); }
    if (inflight[key]) { return inflight[key]; }

    inflight[key] = $.ajax({
        url: $slot.attr('data-url'),
        method: 'GET',
        data: { pid: pid, country: country },
        dataType: 'html',
        timeout: TIMEOUT_MS
    }).then(function (html, status, xhr) {
        var out = xhr.status === 200 && $.trim(html) ? html : '';
        writeStore(key, out);
        return out;
    }).always(function () {
        delete inflight[key];
    });
    return inflight[key];
}

function update($slot, pid) {
    var token = ++seq; // ignore stale responses when the shopper switches variants quickly
    if (!pid) { setState($slot, 'hidden'); return; }

    setState($slot, 'loading');
    fetchFragment($slot, pid).done(function (html) {
        if (token !== seq) { return; }
        if (!html) { setState($slot, 'hidden'); return; }
        $slot.find('.js-delivery-estimate-content').html(html);
        setState($slot, 'ready');
    }).fail(function () {
        if (token === seq) { setState($slot, 'hidden'); } // never break the PDP
    });
}

/* Loaded on the PDP via assets.addJs (see availabilityContainer.isml); jQuery is a page global. */
$(document).ready(function () {
    var $slot = $('.js-delivery-estimate').first();
    if (!$slot.length) { return; } // feature disabled / not rendered

    loadFont();

    var initialPid = $slot.attr('data-pid');
    if (initialPid) { update($slot, initialPid); }

    $('body').on('product:afterAttributeSelect', function (e, response) {
        var product = response && response.data && response.data.product;
        var sellable = product && product.readyToOrder && product.available;
        update($slot, sellable ? product.id : '');
    });
});
