import { differenceInCalendarDays } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    createIsoDate,
    mergeEventNames,
    resolveCaseVariations,
    filterRedundantDates,
    getStartDate,
    areStringsSimilar
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
    latestDate: Date;
}

export function groupEvents(events: Event[]): GroupedEvent[] {
    if (events.length === 0) return [];

    const sortedEvents = events;

    // Pass 1: Group by Fuzzy Match
    const groups: IntermediateGroup[] = [];

    for (const event of sortedEvents) {
        const eventDate = getStartDate(event.date);
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
            // Since we match on Date (proximity) AND Venue (fuzzy) AND Event Name (fuzzy),
            // we have enough signal to group correctly without location strictness.

            // const loc1 = (event.location || "").toLowerCase().trim();
            // const loc2 = (group.baseEvent.location || "").toLowerCase().trim();
            // if (loc1 !== loc2) continue;

            // 2. Venue Fuzzy Match
            // Check if current event venue is similar to ANY of the group's venues
            const venueMatch = Array.from(group.venues).some(v => areStringsSimilar(v, event.venue));

            if (!venueMatch) continue;

            // 3. Fuzzy Match (Event Name OR Performer)
            // We check if:
            // - Event Name matches any Group Event Name
            // - Event Name matches any Group Performer
            // - Event Performer matches any Group Event Name
            // - Event Performer matches any Group Performer
            const name1 = event.event;
            const perf1 = event.performer;

            const eventMatch =
                Array.from(group.eventNames).some(n => areStringsSimilar(n, name1)) ||
                Array.from(group.performers).some(p => areStringsSimilar(p, name1)) ||
                (perf1 ? Array.from(group.eventNames).some(n => areStringsSimilar(n, perf1)) : false) ||
                (perf1 ? Array.from(group.performers).some(p => areStringsSimilar(p, perf1)) : false);

            if (!eventMatch) continue;

            // All matched -> Merge
            group.urls.add(event.url);
            group.eventNames.add(event.event);
            if (event.performer) group.performers.add(event.performer);
            group.venues.add(event.venue);
            const dateTimeStr = createIsoDate(event.date, event.time);
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
            const dateTimeStr = createIsoDate(event.date, event.time);
            const newGroup: IntermediateGroup = {
                baseEvent: event,
                venueNormalized: normalizeVenue(event.venue), // Keep for reference if needed, though unused in logic now
                urls: new Set([event.url]),
                eventNames: new Set([event.event]),
                performers: new Set(event.performer ? [event.performer] : []),
                venues: new Set([event.venue]),
                dates: new Set([dateTimeStr]),
                sourceEvents: [event],
                latestDate: eventDate
            };

            groups.push(newGroup);
        }
    }

    // Pass 2: Group by Venue + Time (Logic to merge groups? Or is Pass 1 sufficient?)
    // The original code had a Pass 2 to "Group by Venue + Time".
    // This merged groups that were separate in Pass 1 but had same start time/venue.
    // Given the new fuzzy logic, we might still have separate groups if "Pass 1" didn't catch them 
    // (e.g. if they were not consecutive but essentially same event? No, logic was diff <= 1).
    // The original Pass 2 was for "Venue + Time".
    // With fuzzy matching, we should have caught most relevant merges.
    // However, if we have duplicate listings (same time, same venue) that weren't caught 
    // (maybe due to sorting order? or slight name diffs not caught by fuzzy?), we might want to dedupe.
    // But for now, let's Stick to Pass 1 as the primary grouper.
    // Any remaining "split" groups are likely distinct enough or too far apart in time.

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

            const timeA = a.time || "";
            const timeB = b.time || "";
            const timeDiff = timeA.localeCompare(timeB);
            if (timeDiff !== 0) return timeDiff;

            const urlA = a.urls[0] || "";
            const urlB = b.urls[0] || "";
            return urlA.localeCompare(urlB);
        });
}
