import { differenceInCalendarDays, parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    createIsoDate,
    getDomain,
    mergeEventNames,
    resolveCaseVariations,
    filterRedundantDates,
    getStartDate
} from "./eventUtils";

interface IntermediateGroup {
    baseEvent: Event;
    urls: Set<string>;
    eventNames: Set<string>;
    performers: Set<string>;
    venues: Set<string>;
    dates: Set<string>; // Set of ISO strings
    venueNormalized: string;
    sourceEvents: Event[];
}

export function groupEvents(events: Event[]): GroupedEvent[] {
    if (events.length === 0) return [];

    const sortedEvents = events;

    // Pass 1: Group by Event + Venue
    const pass1Groups: IntermediateGroup[] = [];
    // Key: venueNormalized + "__" + eventNameNormalized
    const activeGroups = new Map<string, IntermediateGroup & { latestDate: Date }>();

    for (const event of sortedEvents) {
        const normVenue = normalizeVenue(event.venue);
        const normEventName = normalizeEventName(event.event);
        const eventDate = getStartDate(event.date);

        const key = `${normVenue}__${normEventName}`;
        let matched = false;

        const candidateGroup = activeGroups.get(key);

        if (candidateGroup) {
            // Check consecutive
            // Since events are sorted by date, we usually only need to check the last one.
            const diff = Math.abs(differenceInCalendarDays(eventDate, candidateGroup.latestDate));

            if (diff <= 1) {
                // Merge into this group
                candidateGroup.urls.add(event.url);
                candidateGroup.eventNames.add(event.event);
                candidateGroup.performers.add(event.performer);
                candidateGroup.venues.add(event.venue);
                const dateTimeStr = createIsoDate(event.date, event.time);
                candidateGroup.dates.add(dateTimeStr);
                candidateGroup.sourceEvents.push(event);

                // Update latest date
                // Since input is sorted, eventDate is >= latestDate, so we just update it.
                candidateGroup.latestDate = eventDate;

                matched = true;
            }
        }

        if (!matched) {
            // Create new group
            const dateTimeStr = createIsoDate(event.date, event.time);
            const newGroup = {
                baseEvent: event,
                venueNormalized: normVenue,
                urls: new Set([event.url]),
                eventNames: new Set([event.event]),
                performers: new Set([event.performer]),
                venues: new Set([event.venue]),
                dates: new Set([dateTimeStr]),
                sourceEvents: [event],
                latestDate: eventDate // Track for O(1) consecutive check
            };

            pass1Groups.push(newGroup);
            activeGroups.set(key, newGroup);
        }
    }

    // Pass 2: Group by Venue + Time
    const pass2Map = new Map<string, IntermediateGroup>();

    for (const group of pass1Groups) {
        const sortedDates = Array.from(group.dates).sort();
        const startTime = sortedDates[0];
        let key = `${group.venueNormalized}__${startTime}`;

        // Skip grouping if time is null
        // Ensure uniqueness via ID
        if (!startTime.includes("T")) {
            key += `__${group.baseEvent.id}`;
        }

        if (pass2Map.has(key)) {
            const existing = pass2Map.get(key)!;
            // Merge
            group.urls.forEach(u => existing.urls.add(u));
            group.eventNames.forEach(t => existing.eventNames.add(t));
            group.performers.forEach(a => existing.performers.add(a));
            group.venues.forEach(v => existing.venues.add(v));
            group.dates.forEach(d => existing.dates.add(d));
            existing.sourceEvents.push(...group.sourceEvents);
        } else {
            pass2Map.set(key, group);
        }
    }

    // Convert back to Array
    return Array.from(pass2Map.values()).map(g => {
        const sortedDates = Array.from(g.dates).sort();

        let time: string | null = null;
        const baseDate = g.baseEvent.date;

        for (const dStr of sortedDates) {
            // Find time on same day
            // If the group starts on Jan 1 with no time, and next entry is Jan 2 19:00, we stick with null (Jan 1).
            if (!dStr.startsWith(baseDate)) {
                break;
            }
            if (dStr.includes("T")) {
                time = dStr.split("T")[1];
                break;
            }
        }

        return {
            id: g.baseEvent.id, // Use ID of first event
            event: mergeEventNames(g.eventNames),
            performer: resolveCaseVariations(Array.from(g.performers)).join("\n\n"),
            venue: resolveCaseVariations(Array.from(g.venues))[0] || "",
            location: g.baseEvent.location || "",
            date: g.baseEvent.date, // Use earliest date for sorting usually?
            time,
            urls: Array.from(g.urls),
            sourceEvents: g.sourceEvents,
            displayDates: filterRedundantDates(Array.from(g.dates)) // Sorted list for display
        };
    });
}
