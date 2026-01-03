import { differenceInCalendarDays } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    normalizeLocation,
    createIsoDate,
    mergeEventNames,
    resolveCaseVariations,
    filterRedundantDates,
    getStartDate,
    getStartDate,
    areStringsSimilar,
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
    venueNormalized: string;
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

        // Iterate backwards through recent groups to find a match
        // We only check groups with recent dates (consecutive days)
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));

            if (diff > 1) {
                // Since events are sorted by date, older groups won't match
                // We can stop searching
                break;
            }

            // 1. Location Match (strict on normalized)
            // Strict location matching is removed because different sources use different formats
            // (e.g., "Osaka, Japan" vs "大阪府").

            // 2. Venue Fuzzy Match
            // Check if current event venue is similar to ANY of the group's venues
            const venueMatch = Array.from(group.venues).some(v => areStringsSimilar(v, event.venue));

            if (!venueMatch) continue;

            // 2.5 Location Match (Safety Check)
            // If venues match, we MUST ensure locations aren't contradictory.
            // If both have valid locations, they must match (normalized).
            const loc1 = normalizeLocation(event.location);
            let locationConflict = false;

            if (loc1) {
                // Check against existing group locations
                for (const loc2Raw of Array.from(group.locations)) {
                    const loc2 = normalizeLocation(loc2Raw);
                    if (loc2 && loc1 !== loc2) {
                        locationConflict = true;
                        break;
                    }
                }
            }
            if (locationConflict) continue;

            // 3. Match (Event Name OR Performer)
            // - Event Name matches any Group Event Name (STRICT)
            // - Event Name matches any Group Performer (STRICT)
            // - Event Performer matches any Group Event Name (STRICT)
            // - Event Performer matches any Group Performer (STRICT)
            const name1 = event.event;
            const perf1 = event.performer;

            // Use base name for matching (ignoring " || ...")
            const baseName1 = getEventBaseName(name1);
            const n1Norm = normalizeEventName(baseName1);
            const p1Norm = perf1 ? normalizeEventName(perf1) : "";

            const eventMatch =
                Array.from(group.eventNames).some(n => normalizeEventName(getEventBaseName(n)) === n1Norm) ||
                Array.from(group.performers).some(p => normalizeEventName(p) === n1Norm) ||
                (perf1 ? Array.from(group.eventNames).some(n => normalizeEventName(getEventBaseName(n)) === p1Norm) : false) ||
                (perf1 ? Array.from(group.performers).some(p => normalizeEventName(p) === p1Norm) : false);

            const isDateTimeMatch = group.dates.has(dateTimeStr) && dateTimeStr.includes("T");

            if (!eventMatch && !isDateTimeMatch) continue;

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

            // Move key optimization: keep "active" groups at the end of the array
            // so we find them faster in the backwards loop and maintain roughly sorted order
            groups.push(groups.splice(i, 1)[0]);

            matched = true;
            break;
        }

        if (!matched) {
            // Create new group

            const newGroup: IntermediateGroup = {
                baseEvent: event,
                venueNormalized: normalizeVenue(event.venue), // Keep for reference if needed, though unused in logic now
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
    // (Skipped: Pass 1 fuzzy matching is sufficient)

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
                performer: resolveCaseVariations(Array.from(g.performers).filter(Boolean)).join("\n\n"),
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
