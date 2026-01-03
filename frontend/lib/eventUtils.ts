import { parseISO } from "date-fns";
import { formatLocation } from "./prefectures";

// Bracket pairs for balancing logic
const BRACKETS: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '【': '】',
    '<': '>',
    '“': '”'
};
const REVERSE_BRACKETS: Record<string, string> = Object.entries(BRACKETS).reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
}, {} as Record<string, string>);

function getUnbalancedOpens(str: string): string[] {
    const stack: string[] = [];
    for (const char of str) {
        if (BRACKETS[char]) {
            stack.push(char);
        } else if (REVERSE_BRACKETS[char]) {
            const last = stack[stack.length - 1];
            if (last === REVERSE_BRACKETS[char]) {
                stack.pop();
            } else {
                // Unexpected close - treating strictly or just ignoring?
                // For "left diff", strictness might be tricky if it started mid-context,
                // but usually left diff starts from valid start.
                // If we see ')' without '(', it means an unbalanced close.
                // For the purpose of "Left Context", we care about OPENS that are NOT CLOSED.
                // So we can ignore extra closes or treat them as neutral for *open* count.
                // But conceptually, 'a ) b (' -> stack has '('.
            }
        }
    }
    return stack;
}

function getUnbalancedCloses(str: string): string[] {
    // Reverse logic for checking "Right Diff"
    // We want to know which Closes are waiting for an Open.
    // easier to scan backwards
    const stack: string[] = [];
    for (let i = str.length - 1; i >= 0; i--) {
        const char = str[i];
        if (REVERSE_BRACKETS[char]) { // It's a close char like ')'
            stack.push(char);
        } else if (BRACKETS[char]) { // It's an open char like '('
            const last = stack[stack.length - 1];
            if (last === BRACKETS[char]) {
                stack.pop();
            }
        }
    }
    return stack;
}

function refineCommonString(common: string, originals: string[]): string {
    if (!common) return "";

    let trimStart = 0;
    let trimEnd = 0;

    // 1. Analyze Left Side Requirements
    for (const original of originals) {
        // Find where common starts in this original
        // Note: common might appear multiple times? Assumption: getCommonSubstring usually aligns 
        // with the "main" structure. We'll search for the first occurrence.
        const idx = original.indexOf(common);
        if (idx === -1) continue; // Should not happen based on getCommonSubstring logic

        const left = original.substring(0, idx);

        // Check unbalanced opens in Left
        const openStack = getUnbalancedOpens(left);
        if (openStack.length > 0) {
            // We need to resolve these opens within `common`.
            // Scan `common` to find where they close.

            // We clone the stack because we'll be popping from it as we find matches
            const currentStack = [...openStack];


            let neededCut = 0;

            // We also need to handle new brackets opening/closing WITHIN common 
            // so we don't match a new ')' to an old '(' if there was an intervening '('.
            // Actually, a simple stack approach processing `common` works:
            // Pre-fill stack with `openStack`. Process chars. When stack empties -> we found the point.

            // Internal stack for brackets starting inside common
            const internalStack: string[] = [];

            for (let i = 0; i < common.length; i++) {
                const char = common[i];

                if (BRACKETS[char]) {
                    // New open inside common
                    internalStack.push(char);
                } else if (REVERSE_BRACKETS[char]) {
                    // It's a close
                    // First try to close internal stack
                    if (internalStack.length > 0) {
                        const last = internalStack[internalStack.length - 1];
                        if (last === REVERSE_BRACKETS[char]) {
                            internalStack.pop();
                        }
                    } else {
                        // Try to close external stack (from left diff)
                        if (currentStack.length > 0) {
                            const last = currentStack[currentStack.length - 1];
                            if (last === REVERSE_BRACKETS[char]) {
                                currentStack.pop();
                                // If this was the last one needed, update neededCut
                                if (currentStack.length === 0) {
                                    neededCut = i + 1; // Cut up to and including this char
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (neededCut > trimStart) {
                trimStart = neededCut;
            }
        }
    }

    // 2. Analyze Right Side Requirements
    // Similar logic but backwards
    for (const original of originals) {
        const idx = original.lastIndexOf(common);
        if (idx === -1) continue;

        const right = original.substring(idx + common.length);
        const closeStack = getUnbalancedCloses(right); // Returns stack of CLOSES, e.g. [')', ']']

        if (closeStack.length > 0) {
            const currentStack = [...closeStack];
            const internalStack: string[] = []; // Stack for CLOSES found in common (scanning backwards)

            let neededCutFromEnd = 0; // Count of chars to remove from end

            for (let i = common.length - 1; i >= 0; i--) {
                const char = common[i];

                if (REVERSE_BRACKETS[char]) {
                    // It's a close inside common
                    internalStack.push(char);
                } else if (BRACKETS[char]) {
                    // It's an open
                    if (internalStack.length > 0) {
                        const last = internalStack[internalStack.length - 1];
                        if (last === BRACKETS[char]) {
                            internalStack.pop();
                        }
                    } else {
                        if (currentStack.length > 0) {
                            const last = currentStack[currentStack.length - 1];
                            if (last === BRACKETS[char]) {
                                currentStack.pop();
                                if (currentStack.length === 0) {
                                    neededCutFromEnd = common.length - i; // Remove from i onwards
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (neededCutFromEnd > trimEnd) {
                trimEnd = neededCutFromEnd;
            }
        }
    }

    if (trimStart + trimEnd >= common.length) {
        return ""; // Consumed everything
    }

    return common.substring(trimStart, common.length - trimEnd);
}

export function getCommonSubstring(strings: string[]): string {
    if (!strings || strings.length === 0) return "";
    if (strings.length === 1) return strings[0];

    // sorting by length ascending helps optimization (shortest string limits the common substring)
    const sorted = [...strings].sort((a, b) => a.length - b.length);
    const shortest = sorted[0];
    const rest = sorted.slice(1);



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
    return (name || "")
        .toLowerCase()
        .replace(/’/g, "'")
        .replace(/[“”]/g, '"')
        .trim();
};

export const getEventBaseName = (name: string | null | undefined): string => {
    if (!name) return "";
    // Split by separator ' || '
    if (name.includes(" || ")) {
        return name.split(" || ")[0].trim();
    }
    return name;
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
    if (uniqueNames.length === 1) return uniqueNames[0].replace(/ \|\| /g, " ");

    // Try to find a meaningful common substring
    let common = getCommonSubstring(uniqueNames).trim();

    // Refine common string to avoid splitting brackets
    if (common) {
        common = refineCommonString(common, uniqueNames).trim();
    }

    // Use common string if it's substantial enough.
    // "Substantial" is subjective, but let's say it must be at least 3 chars
    // and cover a reasonable portion? 
    // Actually, for "Event A" vs "Event B", common is "Event ". 
    // The user wants "remove uncommon part and render on tooltips".
    // So if common string is found and is not empty, we generally prefer it,
    // UNLESS it's too short (like just "The " or "2026").
    // Let's enforce a minimum length of 2 to avoid single letter matches.
    if (common.length >= 2) {
        // Strip trailing separator if present
        if (common.endsWith(" || ")) {
            common = common.slice(0, -4).trim();
        } else if (common.endsWith(" ||")) {
            common = common.slice(0, -3).trim();
        }
        return common;
    }

    return uniqueNames.join(" / ");
}

export function mergePerformers(performers: string[]): string {
    const unique = resolveCaseVariations(performers.filter(Boolean));
    if (unique.length === 0) return "";

    // Sort by length descending
    unique.sort((a, b) => b.length - a.length);

    const result: string[] = [];

    // Helper for fuzzy inclusion check
    // Use stripSymbols to ignore punctuation and whitespace differences
    const normalizeForCheck = (s: string) => stripSymbols(s).toLowerCase();

    for (const p of unique) {
        const pNorm = normalizeForCheck(p);
        // If this performer string is contained in any already accepted (longer) performer string, skip it
        const isSubset = result.some(kept => {
            const keptNorm = normalizeForCheck(kept);
            const checksOut = keptNorm.includes(pNorm);
            // Debugging log (temporary)
            if (process.env.NODE_ENV === 'development') {
                console.log(`[mergePerformers] Checking sub: "${p.substring(0, 20)}..." in "${kept.substring(0, 20)}..."`);
                console.log(`[mergePerformers] Norms: "${pNorm.substring(0, 20)}..." in "${keptNorm.substring(0, 20)}..." -> ${checksOut}`);
            }
            return checksOut;
        });

        if (!isSubset) {
            result.push(p);
        }
    }

    return result.join("\n\n");
}

export function resolveCaseVariations(items: string[]): string[] {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
        if (!item) continue;
        const key = normalizeEventName(item);
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
