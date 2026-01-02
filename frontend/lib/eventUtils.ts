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
    const names = resolveCaseVariations(Array.from(namesSet));
    // Filter contained or fuzzy-matched names
    const uniqueNames = names.filter(t1 => {
        // Drop t1 if there is any t2 that is "better"
        return !names.some(t2 => {
            if (t1 === t2) return false;

            // Check fuzzy similarity (includes strict substring match logic internally)
            if (areStringsSimilar(t1, t2)) {
                // If t2 is longer, it's "better" (has more info) -> drop t1
                if (t2.length > t1.length) return true;
                // Tie-breaker: if same length, drop the one that is lexicographically smaller to ensure stability
                if (t2.length === t1.length && t2 > t1) return true;
            }

            // Fallback: strict containment even if fuzzy matched failed (unlikely but safe)
            if (t2.includes(t1)) return true;

            return false;
        });
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
