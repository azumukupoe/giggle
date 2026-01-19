import { parseISO } from "date-fns";



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

            }
        }
    }
    return stack;
}

function getUnbalancedCloses(str: string): string[] {
    // Reverse logic: Check which Closes are waiting for an Open (scanning backwards)
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


    for (const original of originals) {
        // Find where common starts in this original
        const idx = original.indexOf(common);
        if (idx === -1) continue;

        const left = original.substring(0, idx);


        const openStack = getUnbalancedOpens(left);
        if (openStack.length > 0) {
            // We need to resolve these opens within `common`.

            const currentStack = [...openStack];
            let neededCut = 0;
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

    // Optimization: Common substring of [A, B, C] is Common(Common(A, B), C)

    let currentCommon = strings[0];

    for (let i = 1; i < strings.length; i++) {
        currentCommon = getLongestCommonSubstringTwoStrings(currentCommon, strings[i]);
        if (!currentCommon) return ""; // Overlap is empty, result is empty
    }

    return currentCommon;
}

// O(N*M) DP approach for Longest Common Substring
function getLongestCommonSubstringTwoStrings(str1: string, str2: string): string {
    if (!str1 || !str2) return "";


    if (str1.includes(str2)) return str2;
    if (str2.includes(str1)) return str1;

    const len1 = str1.length;
    const len2 = str2.length;

    let maxLen = 0;
    let endPos = 0; // End position in str1

    const table: number[][] = Array(len1).fill(0).map(() => Array(len2).fill(0));

    for (let i = 0; i < len1; i++) {
        for (let j = 0; j < len2; j++) {
            if (str1[i] === str2[j]) {
                if (i === 0 || j === 0) {
                    table[i][j] = 1;
                } else {
                    table[i][j] = table[i - 1][j - 1] + 1;
                }

                if (table[i][j] > maxLen) {
                    maxLen = table[i][j];
                    endPos = i;
                }
            } else {
                table[i][j] = 0;
            }
        }
    }

    if (maxLen === 0) return "";
    return str1.substring(endPos - maxLen + 1, endPos + 1);
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
    // Split by separator '||'
    if (name.includes("||")) {
        return name.split("||")[0].trim();
    }
    return name;
};

export const normalizeLocation = (loc: string | null | undefined): string => {
    if (!loc) return "";

    // 1. Basic cleanup (remove Country code if present)
    // Inline formatLocation logic partially: remove Japan suffix
    let s = loc.replace(/, Japan$/, "").replace(/Japan$/, "").trim().toLowerCase();

    // 2. Remove common suffixes in English
    s = s.replace(/\s+(prefecture|city|ward)$/, "");

    return s;
};

export const stripSymbols = (str: string): string => {
    // 1. Normalize unicode (NFKC) to handle full-width chars etc.
    const normalized = (str || "").normalize("NFKC");
    // 2. Keep letters, numbers. Remove everything else (including spaces).
    return normalized.replace(/[^\p{L}\p{N}]/gu, "");
};

export const areStringsSimilar = (s1: string | null | undefined, s2: string | null | undefined): boolean => {
    if (!s1 || !s2) return false;
    const n1 = stripSymbols(s1.toLowerCase()).trim();
    const n2 = stripSymbols(s2.toLowerCase()).trim();
    if (!n1 || !n2) return false;
    return n1.includes(n2) || n2.includes(n1);
};


export const createIsoDate = (date: string, time: string | string[] | null): string => {
    if (!time) return date;

    const tStr = Array.isArray(time) ? (time.length > 0 ? time[0] : null) : time;
    if (!tStr) return date;

    // Fix timezone offset
    let properTime = tStr;
    if (/[+-]\d{2}$/.test(tStr)) {
        properTime = `${tStr}:00`;
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


export function getStartDate(dateInput: string | string[]): Date {
    if (Array.isArray(dateInput)) {
        if (dateInput.length === 0) return new Date("2999-12-31");
        // Assume sorted or just take first? Better to sort min.
        const sorted = [...dateInput].sort();
        return parseISO(sorted[0]);
    }
    const dateStr = dateInput;
    // Handle space-separated range (e.g. "2026-01-03 2026-02-07")
    const parts = dateStr.trim().split(/\s+/);
    // Use the first part as start date
    const d1 = parseISO(parts[0]);
    if (!isNaN(d1.getTime())) {
        return d1;
    }

    // Fallback: far future
    return new Date("2999-12-31");
}

export function getEndDate(dateInput: string | string[]): Date {
    if (Array.isArray(dateInput)) {
        if (dateInput.length === 0) return new Date("1970-01-01");
        const sorted = [...dateInput].sort();
        return parseISO(sorted[sorted.length - 1]);
    }
    const dateStr = dateInput;
    // Handle space-separated range (e.g. "2026-01-03 2026-02-07")
    const parts = dateStr.trim().split(/\s+/);
    // Use the last part as end date
    const d1 = parseISO(parts[parts.length - 1]);
    if (!isNaN(d1.getTime())) {
        return d1;
    }

    // Fallback: far past to ensure no false inclusion
    return new Date("1970-01-01");
}

export function cleanEventName(name: string): string {
    if (!name) return "";

    const n = name
        .replace(/’/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/\s*&\s*/g, " & ")
        .replace(/\s*\/\s*/g, " / ");

    if (n.includes("||")) {
        const parts = n.split(/\s*\|\|\s*/);
        if (parts.length > 1) {
            const prefix = parts[0].trim();
            const rest = parts.slice(1).join(" ").trim();
            // If the event name (rest) starts with the artist/group name (prefix),
            // remove the redundant prefix.
            if (rest.startsWith(prefix)) {
                return rest;
            }
        }
        return n.replace(/\s*\|\|\s*/g, " ");
    }
    return n;
}

export function mergeEventNames(namesSet: Set<string>): string[] {
    const uniqueNames = resolveCaseVariations(Array.from(namesSet))
        .map(n => cleanEventName(n));
    if (uniqueNames.length === 0) return [];
    if (uniqueNames.length === 1) return uniqueNames;

    // Try to find a meaningful common substring
    let common = getCommonSubstring(uniqueNames).trim();

    // Refine common string to avoid splitting brackets
    if (common) {
        common = refineCommonString(common, uniqueNames).trim();

        // Check if the common string is a prefix of a collaboration name (e.g. "Artist A" vs "Artist A×Artist B")
        // If so, prefer the collaboration name as it is more specific and accurate for the group.
        const collabCandidate = uniqueNames.find(n => n.startsWith(common) && n.substring(common.length).trim().startsWith("×"));
        if (collabCandidate) {
            common = collabCandidate;
        }
    }

    // Use common string if it's substantial enough.
    // Let's enforce a minimum length of 2 to avoid single letter matches.
    if (common.length >= 2) {
        // Strip trailing separator if present
        if (common.endsWith("||")) {
            common = common.slice(0, -2).trim();
        }
        return [common];
    }

    // Check if there is a "Superset" name that contains all other names.
    // e.g. ["GMO SONIC", "2026", "GMO SONIC 2026"] -> "GMO SONIC 2026"
    for (const name of uniqueNames) {
        const norm = normalizeEventName(name);
        const isSuperset = uniqueNames.every(other => {
            if (other === name) return true;
            return norm.includes(normalizeEventName(other));
        });

        if (isSuperset) {
            return [name];
        }
    }

    return uniqueNames;
}

export function mergePerformers(performers: string[]): string[] {
    const unique = resolveCaseVariations(performers.filter(Boolean));
    if (unique.length === 0) return [];

    // Sort by length descending
    unique.sort((a, b) => b.length - a.length);

    const result: string[] = [];

    for (const p of unique) {
        // Normalization for comparison: remove all non-alphanumeric, lowercase
        const pNorm = stripSymbols(p).toLowerCase();

        // If this performer string is contained in any already accepted (longer) performer string, skip it
        const isSubset = result.some(kept => {
            const keptNorm = stripSymbols(kept).toLowerCase();
            return keptNorm.includes(pNorm);
        });

        if (!isSubset) {
            result.push(p);
        }
    }

    return result;
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
