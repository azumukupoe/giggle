"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimezoneOffset = getTimezoneOffset;
const city_timezones_1 = __importDefault(require("city-timezones"));
const prefectures_1 = require("./prefectures");
const COUNTRY_ALIASES = {
    'UK': 'GB',
    'USA': 'US',
    'UAE': 'AE',
    'KOREA': 'KR',
    'RUSSIA': 'RU'
};
function getTimezoneOffset(dateStr, location) {
    // 1. Default to Japan if no location provided or explicit Japan check passes
    if (!location || location.toLowerCase().includes('japan') || (0, prefectures_1.isJapanesePrefecture)(location)) {
        return getOffsetForZone(dateStr, 'Asia/Tokyo');
    }
    // 2. Search logic
    const parts = location.split(',').map(s => s.trim());
    const candidates = [];
    // Gather all candidates from all parts
    for (const part of parts) {
        if (part.length < 2)
            continue; // Skip single chars
        const matches = city_timezones_1.default.findFromCityStateProvince(part);
        if (matches && matches.length > 0) {
            candidates.push(...matches);
        }
    }
    if (candidates.length === 0) {
        return getOffsetForZone(dateStr, 'Asia/Tokyo');
    }
    // 3. Score and Filter
    // We want to find the candidate that best matches the *entire* location string.
    // E.g. "London, UK" -> "London" gives us London (CA), London (UK), etc.
    // "UK" matches the country of London (UK).
    // Normalize location string for searching
    const locationLower = location.toLowerCase();
    const scored = candidates.map(c => {
        let score = 0;
        // Boost by population (log scale to just be a tiebreaker for major cities)
        // pop is string or number? Library says number usually.
        if (c.pop) {
            score += Math.log10(c.pop);
        }
        // Boost by Country Match
        const countryLower = c.country.toLowerCase();
        if (locationLower.includes(countryLower)) {
            score += 20;
        }
        // Boost by ISO codes
        if (c.iso2 && locationLower.includes(c.iso2.toLowerCase()))
            score += 20;
        if (c.iso3 && locationLower.includes(c.iso3.toLowerCase()))
            score += 20;
        // Check aliases
        for (const [alias, iso] of Object.entries(COUNTRY_ALIASES)) {
            if (locationLower.includes(alias.toLowerCase()) && c.iso2 === iso) {
                score += 20;
            }
        }
        // Boost by Province/State
        if (c.province && locationLower.includes(c.province.toLowerCase())) {
            score += 10;
        }
        return { candidate: c, score };
    });
    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    // Pick top
    if (scored.length > 0) {
        return getOffsetForZone(dateStr, scored[0].candidate.timezone);
    }
    return getOffsetForZone(dateStr, 'Asia/Tokyo');
}
function getOffsetForZone(dateStr, timeZone) {
    try {
        // Extract just date part if it has "T", or assume start of day
        // We need a valid Date object to determine DST
        // If dateStr is "2026-02-16T19:00", new Date(dateStr) in UTC might be fine?
        // Actually, we want to know the offset of THAT timezone AT that wall-clock time.
        // But offset mostly depends on date (Standard vs DST).
        let targetDate = new Date();
        if (dateStr) {
            // Create a date object. 
            // If dateStr has no timezone, generic Date parsing might assume UTC or Local.
            // We just need *approximate* date to check if it's DST or not.
            // "2026-06-01" -> June 1st.
            targetDate = new Date(dateStr);
        }
        const str = targetDate.toLocaleString('en-US', {
            timeZone,
            timeZoneName: 'longOffset',
        });
        // Output format example: "6/1/2026, 12:00:00 AM GMT+01:00" or just "GMT"
        if (str.endsWith("GMT") || str.endsWith("UTC")) {
            return '+00:00';
        }
        const match = str.match(/GMT([+-]\d{2}:\d{2})/);
        return match ? match[1] : '+09:00';
    }
    catch (e) {
        console.warn(`Error getting timezone offset for ${timeZone}:`, e);
        return '+09:00';
    }
}
