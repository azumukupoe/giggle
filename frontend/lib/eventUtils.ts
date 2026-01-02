import { parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";

export const normalizeVenue = (venue: string | null | undefined): string => {
    return (venue || "")
        .toLowerCase()
        .replace(/,?\s*japan$/, "")
        .replace(/\s+/g, "");
};

export const normalizeEventName = (name: string | null | undefined): string => {
    return (name || "").toLowerCase().trim();
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


// Common comparison logic for Event and GroupedEvent-like structures
const compareBase = (
    dateA: string,
    dateB: string,
    timeA: string | null,
    timeB: string | null,
    urlA: string,
    urlB: string
): number => {
    const dateDiff = getStartDate(dateA).getTime() - getStartDate(dateB).getTime();
    if (dateDiff !== 0) return dateDiff;

    // Dates equal, sort time (nulls first)
    if (!timeA && !timeB) {
        return urlA.localeCompare(urlB);
    }
    if (!timeA) return -1;
    if (!timeB) return 1;

    const timeDiff = timeA.localeCompare(timeB);
    if (timeDiff !== 0) return timeDiff;

    return urlA.localeCompare(urlB);
};

export function compareGroupedEvents(a: GroupedEvent, b: GroupedEvent): number {
    const urlA = a.urls.length > 0 ? a.urls[0] : "";
    const urlB = b.urls.length > 0 ? b.urls[0] : "";
    return compareBase(a.date, b.date, a.time, b.time, urlA, urlB);
}

export function compareEvents(a: Event, b: Event): number {
    return compareBase(a.date, b.date, a.time, b.time, a.url, b.url);
}

export function mergeEventNames(namesSet: Set<string>): string {
    const names = resolveCaseVariations(Array.from(namesSet));
    // Filter contained names
    const uniqueNames = names.filter(t1 => {
        // If t1 is contained in any OTHER name t2, drop t1.
        return !names.some(t2 => t2 !== t1 && t2.includes(t1));
    });

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

        // Find non-all-caps variants
        const nonAllCaps = variations.filter(v => v !== v.toUpperCase() || v === v.toLowerCase());

        if (nonAllCaps.length > 0) {
            // Pick the first non-all-caps variant
            result.push(nonAllCaps[0]);
        } else {
            // All are all-caps, just pick the first one
            result.push(variations[0]);
        }
    }
    return result;
}

export function filterRedundantDates(dates: string[]): string[] {
    const datesWithTime = new Set<string>();
    const datesWithoutTime = new Set<string>();

    dates.forEach(d => {
        if (d.includes("T")) {
            datesWithTime.add(d.split("T")[0]);
        } else {
            datesWithoutTime.add(d);
        }
    });

    return dates.filter(d => {
        // If it matches YYYY-MM-DD exactly (no time)
        if (!d.includes("T")) {
            // Keep it ONLY if there is NO corresponding entry with time
            return !datesWithTime.has(d);
        }
        // Always keep entries with time
        return true;
    }).sort();
}
