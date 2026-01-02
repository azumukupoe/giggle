import { differenceInCalendarDays, parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    createIsoDate,
    getDomain,
    compareGroupedEvents,
    mergeEventNames,
    resolveCaseVariations,
    filterRedundantDates
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

    // Sort by date then time to make consecutive check easier
    const sortedEvents = [...events].sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;

        // If dates are equal, sort by time (nulls first to match DB query)
        if (!a.time && !b.time) {
            const eventDiff = a.event.localeCompare(b.event);
            if (eventDiff !== 0) return eventDiff;
            return getDomain(a.url).localeCompare(getDomain(b.url));
        }
        if (!a.time) return -1;
        if (!b.time) return 1;

        const timeDiff = a.time.localeCompare(b.time);
        if (timeDiff !== 0) return timeDiff;

        const eventDiff = a.event.localeCompare(b.event);
        if (eventDiff !== 0) return eventDiff;

        return getDomain(a.url).localeCompare(getDomain(b.url));
    });

    // --- Pass 1: Group by EventName + Venue (detecting consecutive days) ---
    const pass1Groups: IntermediateGroup[] = [];
    // Key: venueNormalized + "__" + eventNameNormalized
    const activeGroups = new Map<string, IntermediateGroup & { latestDate: Date }>();

    for (const event of sortedEvents) {
        const normVenue = normalizeVenue(event.venue);
        const normEventName = normalizeEventName(event.event);
        const eventDate = parseISO(event.date);

        const key = `${normVenue}__${normEventName}`;
        let matched = false;

        const candidateGroup = activeGroups.get(key);

        if (candidateGroup) {
            // Check if consecutive to the LATEST date in the group.
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

                // Update latest date for future consecutive checks
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

    // --- Pass 2: Group by Venue + Start Time ---
    const pass2Map = new Map<string, IntermediateGroup>();

    for (const group of pass1Groups) {
        const sortedDates = Array.from(group.dates).sort();
        const startTime = sortedDates[0];
        let key = `${group.venueNormalized}__${startTime}`;

        // If start time is null (meaning it's just a date string grouping), do NOT group in pass 2.
        // We ensure uniqueness by appending the base event ID to the key.
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
            // We only look for a time on the *same day* as the group starts.
            // If the group starts on Jan 1 with no time, but has a Jan 1 19:00 entry, use 19:00.
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
    }).sort(compareGroupedEvents);
}
