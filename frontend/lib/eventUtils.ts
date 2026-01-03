import { parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import { formatLocation } from "./prefectures";

export function getCommonSubstring(strings: string[]): string {
    if (!strings || strings.length === 0) return "";
    if (strings.length === 1) return strings[0];

    // sorting by length ascending helps optimization (shortest string limits the common substring)
    const sorted = [...strings].sort((a, b) => a.length - b.length);
    const shortest = sorted[0];
    const rest = sorted.slice(1);

    let longestCommon = "";

    // Iterate through all substrings of the shortest string
    for (let length = shortest.length; length > 0; length--) {
        for (let start = 0; start <= shortest.length - length; start++) {
            const sub = shortest.substring(start, start + length);

            // Check if this substring exists in all other strings
            // We use includes() which is loose matching.
            // Requirement implies removing uncommon parts, so strict substring check is appropriate.
            if (rest.every(str => str.includes(sub))) {
                return sub;
            }
        }
    }

    return "";
}

export const normalizeVenue = (venue: string | null | undefined): string => {
    return (venue || "")
        .toLowerCase()
        .replace(/,?\s*japan$/, "")
        .replace(/\s+/g, "");
};

export const normalizeEventName = (name: string | null | undefined): string => {
    return (name || "").toLowerCase().trim();
};

export const normalizeLocation = (loc: string | null | undefined): string => {
    if (!loc) return "";

    // 1. Unify Japanese -> English using shared logic
    let s = formatLocation(loc, 'en').toLowerCase().trim();

    // 2. Remove common suffixes in English
    s = s.replace(/\s+(prefecture|city|ward)$/, "");

    return s;
};

export const stripSymbols = (str: string): string => {
    // Keep letters, numbers. Remove everything else (including spaces).
    return (str || "").replace(/[^\p{L}\p{N}]/gu, "");
};

export const areStringsSimilar = (s1: string | null | undefined, s2: string | null | undefined): boolean => {
    if (!s1 || !s2) return false;
    const n1 = stripSymbols(s1.toLowerCase()).trim();
    const n2 = stripSymbols(s2.toLowerCase()).trim();
    if (!n1 || !n2) return false;
    return n1.includes(n2) || n2.includes(n1);
};

// Create safe ISO strings
export const createIsoDate = (date: string, time: string | null): string => {
    if (!time) return date;

    // Fix timezone offset
    let properTime = time;
    if (/[+-]\d{2}$/.test(time)) {
        properTime = `${time}:00`;
    }

    return `${date}T${properTime}`;
};

export const getDomain = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};

// Extract sortable Date
export function getStartDate(dateStr: string): Date {
    // Try generic parse
    const d1 = parseISO(dateStr);
    if (!isNaN(d1.getTime())) {
        return d1;
    }

    // Fallback: far future
    return new Date("2999-12-31");
}

export function mergeEventNames(namesSet: Set<string>): string {
    const uniqueNames = resolveCaseVariations(Array.from(namesSet));
    if (uniqueNames.length === 0) return "";
    if (uniqueNames.length === 1) return uniqueNames[0];

    // Try to find a meaningful common substring
    const common = getCommonSubstring(uniqueNames).trim();

    // Use common string if it's substantial enough.
    // "Substantial" is subjective, but let's say it must be at least 3 chars
    // and cover a reasonable portion? 
    // Actually, for "Event A" vs "Event B", common is "Event ". 
    // The user wants "remove uncommon part and render on tooltips".
    // So if common string is found and is not empty, we generally prefer it,
    // UNLESS it's too short (like just "The " or "2026").
    // Let's enforce a minimum length of 2 to avoid single letter matches.
    if (common.length >= 2) {
        return common;
    }

    return uniqueNames.join(" / ");
}

export function resolveCaseVariations(items: string[]): string[] {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
        if (!item) continue;
        const key = item.toLowerCase();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
    }

    const result: string[] = [];
    for (const variations of grouped.values()) {
        if (variations.length === 1) {
            result.push(variations[0]);
            continue;
        }

        // Prioritize: all-lowercase > mixed-case > all-caps
        // Lowercase first to respect stylizations (e.g. "oneohtrix point never")
        const allLowercase = variations.filter(v => v === v.toLowerCase());
        if (allLowercase.length > 0) {
            result.push(allLowercase[0]);
            continue;
        }

        // Then mixed-case
        const mixedCase = variations.filter(v =>
            v !== v.toUpperCase() && v !== v.toLowerCase()
        );
        if (mixedCase.length > 0) {
            result.push(mixedCase[0]);
            continue;
        }

        // Fallback to all-caps
        result.push(variations[0]);
    }
    return result;
}

export function filterRedundantDates(dates: string[]): string[] {
    const datesWithTime = new Set<string>();

    dates.forEach(d => {
        if (d.includes("T")) {
            datesWithTime.add(d.split("T")[0]);
        }
    });

    return dates.filter(d => {
        // If it has a time component, always keep it
        if (d.includes("T")) {
            return true;
        }

        // For date-only entries (may be single or multi-date like "2026-02-16 2026-02-17")
        const dateParts = d.split(" ");

        // Check if ALL date parts have a corresponding entry with time
        const allCovered = dateParts.every(part => datesWithTime.has(part));

        // Keep ONLY if NOT all dates are covered by entries with time
        return !allCovered;
    }).sort();
}
