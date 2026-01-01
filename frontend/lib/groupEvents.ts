import { differenceInCalendarDays, parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";

const normalizeVenue = (venue: string): string => {
    return venue
        .toLowerCase()
        .replace(/,?\s*japan$/, "")
        .replace(/\s+/g, "");
};

const normalizeEventName = (name: string): string => {
    return name.toLowerCase().trim();
};



interface IntermediateGroup {
    baseEvent: Event;
    urls: Set<string>;
    eventNames: Set<string>;
    performers: Set<string>;
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

    for (const event of sortedEvents) {
        const normVenue = normalizeVenue(event.venue);
        const normEventName = normalizeEventName(event.event);
        const eventDate = parseISO(event.date);

        let matched = false;

        // Iterate backwards to find the most recent candidate
        for (let i = pass1Groups.length - 1; i >= 0; i--) {
            const group = pass1Groups[i];

            if (group.venueNormalized !== normVenue) continue;

            const groupEventNameSample = group.baseEvent.event;
            if (normalizeEventName(groupEventNameSample) !== normEventName) continue;

            let isConsecutiveOrSame = false;
            for (const dStr of Array.from(group.dates)) {
                const groupDate = parseISO(dStr);
                const diff = Math.abs(differenceInCalendarDays(eventDate, groupDate));
                if (diff <= 1) {
                    isConsecutiveOrSame = true;
                    break;
                }
            }

            if (isConsecutiveOrSame) {
                // Merge into this group
                group.urls.add(event.url);
                group.eventNames.add(event.event);
                group.performers.add(event.performer);
                const dateTimeStr = event.time ? `${event.date}T${event.time}` : event.date;
                group.dates.add(dateTimeStr);
                group.sourceEvents.push(event);
                matched = true;
                break;
            }
        }

        if (!matched) {
            // Create new group
            const dateTimeStr = event.time ? `${event.date}T${event.time}` : event.date;
            pass1Groups.push({
                baseEvent: event,
                venueNormalized: normVenue,
                urls: new Set([event.url]),
                eventNames: new Set([event.event]),
                performers: new Set([event.performer]),
                dates: new Set([dateTimeStr]),
                sourceEvents: [event]
            });
        }
    }

    // --- Pass 2: Group by Venue + Time Signature ---
    const pass2Map = new Map<string, IntermediateGroup>();

    for (const group of pass1Groups) {
        const dateSig = Array.from(group.dates).sort().join("|");
        const key = `${group.venueNormalized}__${dateSig}`;

        if (pass2Map.has(key)) {
            const existing = pass2Map.get(key)!;
            // Merge
            group.urls.forEach(u => existing.urls.add(u));
            group.eventNames.forEach(t => existing.eventNames.add(t));
            group.performers.forEach(a => existing.performers.add(a));
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
            performer: Array.from(g.performers).join("\n\n"),
            venue: g.baseEvent.venue,
            location: g.baseEvent.location,
            date: g.baseEvent.date, // Use earliest date for sorting usually?
            time,
            urls: Array.from(g.urls),
            sourceEvents: g.sourceEvents,
            displayDates: filterRedundantDates(Array.from(g.dates)) // Sorted list for display
        };
    }).sort(compareGroupedEvents);
}

export const getDomain = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};

export function compareGroupedEvents(a: GroupedEvent, b: GroupedEvent): number {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;

    // If dates are equal, sort by time (nulls first)
    if (!a.time && !b.time) {
        const eventDiff = a.event.localeCompare(b.event);
        if (eventDiff !== 0) return eventDiff;
        const domainA = a.urls.length > 0 ? getDomain(a.urls[0]) : "";
        const domainB = b.urls.length > 0 ? getDomain(b.urls[0]) : "";
        return domainA.localeCompare(domainB);
    }
    if (!a.time) return -1;
    if (!b.time) return 1;

    const timeDiff = a.time.localeCompare(b.time);
    if (timeDiff !== 0) return timeDiff;

    const eventDiff = a.event.localeCompare(b.event);
    if (eventDiff !== 0) return eventDiff;

    const domainA = a.urls.length > 0 ? getDomain(a.urls[0]) : "";
    const domainB = b.urls.length > 0 ? getDomain(b.urls[0]) : "";
    return domainA.localeCompare(domainB);
}


export function mergeEventNames(namesSet: Set<string>): string {
    const names = Array.from(namesSet);
    // Filter out any name that is strictly contained in another name
    // Example: "A" vs "A / B" -> "A" is in "A / B", so we keep "A / B" and drop "A"
    const uniqueNames = names.filter(t1 => {
        // If t1 is contained in any OTHER name t2, drop t1.
        return !names.some(t2 => t2 !== t1 && t2.includes(t1));
    });

    return uniqueNames.join(" / ");
}

function filterRedundantDates(dates: string[]): string[] {
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
