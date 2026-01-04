import { differenceInCalendarDays } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    normalizeLocation,
    createIsoDate,
    mergeEventNames,
    mergePerformers,
    resolveCaseVariations,
    filterRedundantDates,
    getStartDate,

    areStringsSimilar,
    getCommonSubstring,
    getEventBaseName
} from "./eventUtils";

interface IntermediateGroup {
    baseEvent: Event;
    urls: Set<string>;
    eventNames: Set<string>;
    performers: Set<string>;
    venues: Set<string>;
    locations: Set<string>;
    dates: Set<string>; // Set of ISO strings

    sourceEvents: Event[];
    latestDate: Date;
}

export function groupEvents(events: Event[]): GroupedEvent[] {
    if (events.length === 0) return [];

    const sortedEvents = events;

    // Pass 1: Group by Fuzzy Match
    const groups: IntermediateGroup[] = [];

    for (const event of sortedEvents) {
        const eventDate = getStartDate(event.date);
        const dateTimeStr = createIsoDate(event.date, event.time);
        let matched = false;

        // Check recent groups (consecutive days) for a match, iterating backwards
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));

            if (diff > 1) {
                // Since events are sorted by date, older groups won't match
                // We can stop searching
                break;
            }

            // 1. Location Logic
            const loc1 = normalizeLocation(event.location);
            let locationConflict = false;
            let hasCommonLocation = false;

            if (loc1) {
                // Check against existing group locations
                if (group.locations.size > 0) {
                    for (const loc2Raw of Array.from(group.locations)) {
                        const loc2 = normalizeLocation(loc2Raw);
                        if (loc2) {
                            if (loc1 !== loc2) {
                                locationConflict = true;
                            } else {
                                hasCommonLocation = true;
                            }
                        }
                    }
                }
            }

            // If explicit conflict, skip
            if (locationConflict) continue;

            // 2. Venue Matching
            // A. Strict Fuzzy Match (Levenshtein/Includes)
            const strictVenueMatch = Array.from(group.venues).some(v => areStringsSimilar(v, event.venue));

            // B. Partial Venue Match (Common Substring)
            // Useful for cross-script matches like "Nagoya Club Quattro" vs "名古屋CLUB QUATTRO" (Common: "名古屋")
            const partialVenueMatch = Array.from(group.venues).some(v => {
                const norm1 = normalizeVenue(v);
                const norm2 = normalizeVenue(event.venue);
                const common = getCommonSubstring([norm1, norm2]);

                // Heuristic: If we share a "significant" part, we allow it.
                // Non-ASCII (Japanese): >= 2 chars (e.g. "名古屋")
                // ASCII: >= 5 chars (e.g. "Arena", "Nagoya") - avoids "The ", "Hall"
                const isNonAscii = /[^\x00-\x7F]/.test(common);
                if (isNonAscii) return common.length >= 2;
                return common.length >= 5;
            });



            // --- Pass 1 Check: Strict Event Name Match ---
            const name1 = event.event;
            const baseName1 = getEventBaseName(name1);

            // Exact match of "Base Name" (string before ||)
            const pass1Match = Array.from(group.eventNames).some(n => getEventBaseName(n) === baseName1);

            // --- Pass 2 Check: Fuzzy Match (Event or Performer) ---
            const n1Norm = normalizeEventName(baseName1);
            const perf1 = event.performer;
            const p1Norm = perf1 ? normalizeEventName(perf1) : "";

            // Check fuzzy event name match
            const fuzzyEventMatch = Array.from(group.eventNames).some(n =>
                areStringsSimilar(normalizeEventName(getEventBaseName(n)), n1Norm)
            );

            // Check fuzzy performer match (Cross-matching allowed: Event matches Performer, Performer matches Event)
            const fuzzyPerformerMatch =
                Array.from(group.performers).some(p => areStringsSimilar(normalizeEventName(p), n1Norm)) || // Group Perf ~ Event Name
                (perf1 ? Array.from(group.eventNames).some(n => areStringsSimilar(normalizeEventName(getEventBaseName(n)), p1Norm)) : false) || // Group Event ~ New Perf
                (perf1 ? Array.from(group.performers).some(p => areStringsSimilar(normalizeEventName(p), p1Norm)) : false); // Group Perf ~ New Perf

            const pass2Match = fuzzyEventMatch || fuzzyPerformerMatch;

            // Merge Condition
            // REQUIRED: Venue Match AND Consecutive Date (implicit via loop) AND Location Safe
            // OPTIONAL: Pass 1 Match OR Pass 2 Match
            // Venue Logic: 
            // - If Pass 1 (Strict Event Match), allow Partial Venue Match.
            // - If Pass 2 (Fuzzy Event Match), require Strict Venue Match.
            const venueOk = (pass1Match && partialVenueMatch) || strictVenueMatch;


            let shouldMerge = venueOk && (pass1Match || pass2Match);

            // Special handling for "Pass Tickets" (Date Range Containment)
            // If the group has a "Bass Event" that is a range, OR the current event is a range
            // mismatching dates (diff > 1) can be ignored IF:
            // 1. Strict Name Match (pass1Match)
            // 2. Strict Venue Match
            // 3. Date Containment
            if (!shouldMerge && pass1Match && strictVenueMatch) {
                // Check if this event falls within the group's range OR vice versa
                // Actually, since we iterate backwards, we just need to see if ONE of them covers the other.
                // We rely on "getStartDate" and "getEndDate" logic which we need to import or implement inUtils.
                // For now, let's assume we can get range from the group dates.

                // Helper to check range coverage
                const checkCoverage = (rangeDateStr: string, targetDate: Date) => {
                    const parts = rangeDateStr.split(/\s+/);
                    if (parts.length >= 2) {
                        const start = getStartDate(parts[0]);
                        const end = getStartDate(parts[parts.length - 1]); // Use getStartDate as proxy for parse
                        return targetDate >= start && targetDate <= end;
                    }
                    return false;
                };

                const isContainedInGroup = Array.from(group.dates).some(d => checkCoverage(d.split('T')[0], eventDate));

                // Also check if the group is contained in THIS event (if this event works as a pass)
                // const isGroupContainedInEvent = ... (less likely given sort order but possible)

                if (isContainedInGroup) {
                    shouldMerge = true;
                }
            }


            if (!shouldMerge) continue;

            // All matched -> Merge
            group.urls.add(event.url);
            group.eventNames.add(event.event);
            if (event.performer) group.performers.add(event.performer);
            group.venues.add(event.venue);
            if (event.location) group.locations.add(event.location);

            group.dates.add(dateTimeStr);
            group.sourceEvents.push(event);

            // Update latest date
            if (eventDate > group.latestDate) {
                group.latestDate = eventDate;
            }

            // Optimization: Keep active groups at the end for faster backwards search
            groups.push(groups.splice(i, 1)[0]);

            matched = true;
            break;
        }

        if (!matched) {
            // Create new group

            const newGroup: IntermediateGroup = {
                baseEvent: event,

                urls: new Set([event.url]),
                eventNames: new Set([event.event]),
                performers: new Set(event.performer ? [event.performer] : []),
                venues: new Set([event.venue]),
                locations: new Set(event.location ? [event.location] : []),
                dates: new Set([dateTimeStr]),
                sourceEvents: [event],
                latestDate: eventDate
            };

            groups.push(newGroup);
        }
    }

    // Pass 2: Group by Venue + Time

    // Convert back to output format
    return groups
        .map(g => {
            const sortedDates = Array.from(g.dates).sort();

            let time: string | null = null;
            const baseDate = g.baseEvent.date;

            for (const dStr of sortedDates) {
                // Find time on same day as base event (simplified)
                if (dStr.includes("T")) {
                    // Ideally matches the first date's time
                    const dDate = dStr.split("T")[0];
                    if (dDate === baseDate || !time) {
                        time = dStr.split("T")[1];
                    }
                }
            }

            return {
                id: g.baseEvent.id,
                event: mergeEventNames(g.eventNames),
                performer: mergePerformers(Array.from(g.performers)),
                venue: resolveCaseVariations(Array.from(g.venues))[0] || "",
                location: g.baseEvent.location || "",
                date: g.baseEvent.date,
                time,
                urls: Array.from(g.urls),
                sourceEvents: g.sourceEvents,
                displayDates: filterRedundantDates(Array.from(g.dates))
            };
        })
        .sort((a, b) => {
            const dateDiff = a.date.localeCompare(b.date);
            if (dateDiff !== 0) return dateDiff;

            const timeA = a.time;
            const timeB = b.time;

            // Sort logic: valid time < null/empty time
            if (timeA && !timeB) return -1;
            if (!timeA && timeB) return 1;
            if (timeA && timeB) {
                const timeDiff = timeA.localeCompare(timeB);
                if (timeDiff !== 0) return timeDiff;
            }

            const urlA = a.urls[0] || "";
            const urlB = b.urls[0] || "";
            return urlA.localeCompare(urlB);
        });
}
