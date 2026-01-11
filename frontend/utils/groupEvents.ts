import { differenceInCalendarDays } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";
import {
    normalizeVenue,
    normalizeEventName,
    normalizeLocation,
    createIsoDate,
    mergeEventNames,
    mergePerformers,
    filterRedundantDates,
    getStartDate,
    getEndDate,
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

    // Keep track of groups that cover a date range (>1 day)
    // We check these regardless of the "1 day diff" optimization.
    const rangeGroups: IntermediateGroup[] = [];

    const groups: IntermediateGroup[] = [];

    for (const event of sortedEvents) {
        const eventDate = getStartDate(event.date);
        const eventEndDate = getEndDate(event.date);
        const dateTimeStrs = event.date.map(d => createIsoDate(d, event.time));


        const isEventRange = differenceInCalendarDays(eventEndDate, eventDate) > 0;

        let matched = false;


        const checkMatch = (group: IntermediateGroup): boolean => {

            // We require that if both have locations, they must share at least one exact match.
            // If one is missing location, we might permit it (or strictly require it?)
            // "location is exact match" implies a strong condition.
            const eventLocs = event.location || [];
            if (eventLocs.length > 0 && group.locations.size > 0) {
                const groupLocs = Array.from(group.locations);
                const hasLocationMatch = eventLocs.some(l1 =>
                    groupLocs.some(l2 => normalizeLocation(l1) === normalizeLocation(l2))
                );
                if (!hasLocationMatch) return false;
            }


            const eventVenues = event.venue || [];
            if (eventVenues.length > 0 && group.venues.size > 0) {
                const groupVenues = Array.from(group.venues);
                const hasVenueMatch = eventVenues.some(v1 =>
                    groupVenues.some(v2 => {
                        const n1 = normalizeVenue(v1);
                        const n2 = normalizeVenue(v2);
                        return n1.includes(n2) || n2.includes(n1);
                    })
                );
                if (!hasVenueMatch) return false;
            }


            const nameMatch = (
                event.event &&
                event.event.length > 0 &&
                group.baseEvent.event &&
                group.baseEvent.event.length > 0 &&
                normalizeEventName(event.event[0]) === normalizeEventName(group.baseEvent.event[0])
            );

            const performerMatch = (
                event.performer &&
                event.performer.length > 0 &&
                group.performers.size > 0 &&
                event.performer.some(p => group.performers.has(p))
            );

            if (!nameMatch && !performerMatch) return false;


            const groupDates = Array.from(group.dates);
            const hasDateOverlap = dateTimeStrs.some(d => groupDates.includes(d));
            if (hasDateOverlap) return true;


            const lastGroupDate = group.latestDate;
            // Also check vs earliest group date? Use rangeGroups?
            // "consecutive" usually means adjacent days.
            // Check if eventDate is adjacent to ANY date in group? 
            // Or typically just the end of the group?
            // Since events are sorted by date, we mostly assume checking against the latest part of the group.
            // But let's check strict adjacency (1 day difference)
            const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));
            if (diff <= 1) return true;


            // If the group spans a range (minDate to maxDate), and eventDate is inside.
            // We need the min date of the group.
            let minGroupDate = group.latestDate;
            let maxGroupDate = group.latestDate;

            // This is O(N) on dates, but N is small.
            // Ideally should store minDate on IntermediateGroup, but we can compute or use sortedDates logic
            if (group.dates.size > 0) {
                const dates = Array.from(group.dates).sort();
                minGroupDate = getStartDate(dates[0]);
                maxGroupDate = getStartDate(dates[dates.length - 1]);
            }

            const rangeStart = minGroupDate < eventDate ? minGroupDate : eventDate;
            const rangeEnd = maxGroupDate > eventEndDate ? maxGroupDate : eventEndDate;


            // If event is fully inside the group range? OR if the combined range is valid?
            // "within the longest range" usually means the event falls inside the existing group's start/end.
            if (eventDate >= minGroupDate && eventEndDate <= maxGroupDate) return true;

            // Also checking if the group falls within the event (if event is a long festival)
            if (minGroupDate >= eventDate && maxGroupDate <= eventEndDate) return true;

            return false;
        };

        // Pass 1: Check recent groups (Optimization: only look back 1 day)
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));

            if (diff > 1) {

                break;
            }

            if (checkMatch(group)) {

                group.urls.add(event.url);
                (event.event || []).forEach(n => group.eventNames.add(n));
                if (event.performer) event.performer.forEach(p => group.performers.add(p));
                if (event.venue) event.venue.forEach(v => group.venues.add(v));
                if (event.location) event.location.forEach(l => group.locations.add(l));
                dateTimeStrs.forEach(d => group.dates.add(d));
                group.sourceEvents.push(event);

                if (eventDate > group.latestDate) {
                    group.latestDate = eventDate;
                    // Move to end (Keep "hot")
                    groups.push(groups.splice(i, 1)[0]);
                }

                // If the event we just added is a range, ensure this group is in rangeGroups
                if (isEventRange && !rangeGroups.includes(group)) {
                    rangeGroups.push(group);
                }

                matched = true;
                break;
            }
        }

        // Pass 2: If not matched, check known "Range Groups"
        if (!matched) {
            for (const group of rangeGroups) {
                const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));
                if (diff <= 1) continue; // Already checked in main loop

                if (checkMatch(group)) {
                    group.urls.add(event.url);
                    if (event.event) event.event.forEach(n => group.eventNames.add(n));
                    if (event.performer) event.performer.forEach(p => group.performers.add(p));
                    if (event.venue) event.venue.forEach(v => group.venues.add(v));
                    if (event.location) event.location.forEach(l => group.locations.add(l));
                    dateTimeStrs.forEach(d => group.dates.add(d));
                    group.sourceEvents.push(event);

                    if (eventDate > group.latestDate) {
                        group.latestDate = eventDate;
                        // Determine index in `groups` to move it
                        const idx = groups.indexOf(group);
                        if (idx > -1) {
                            groups.push(groups.splice(idx, 1)[0]);
                        }
                    }


                    matched = true;
                    break;
                }
            }
        }

        if (!matched) {
            const newGroup: IntermediateGroup = {
                baseEvent: event,
                urls: new Set([event.url]),
                eventNames: new Set(event.event || []),
                performers: new Set(event.performer || []),
                venues: new Set(event.venue || []),
                locations: new Set(event.location || []),
                dates: new Set(dateTimeStrs),
                sourceEvents: [event],
                latestDate: eventDate
            };

            groups.push(newGroup);
            if (isEventRange) {
                rangeGroups.push(newGroup);
            }
        }
    }

    return groups
        .map(g => {
            const sortedDates = Array.from(g.dates).sort();

            let time: string[] | null = g.baseEvent.time;


            // Prefer one with most info? For now just take first.
            const venues = Array.from(g.venues);
            const resolvedVenue = venues;

            return {
                id: g.baseEvent.id,
                event: mergeEventNames(g.eventNames),
                performer: mergePerformers(Array.from(g.performers)),
                venue: resolvedVenue,
                location: Array.from(g.locations),
                date: g.baseEvent.date,
                time,
                urls: Array.from(g.urls),
                sourceEvents: g.sourceEvents,
                displayDates: filterRedundantDates(Array.from(g.dates)),
                image: g.baseEvent.image
            };
        })
        .sort((a, b) => {
            const dA = getStartDate(a.date).toISOString();
            const dB = getStartDate(b.date).toISOString();
            const dateDiff = dA.localeCompare(dB);
            if (dateDiff !== 0) return dateDiff;

            const timeA = a.time ? a.time[0] : null;
            const timeB = b.time ? b.time[0] : null;

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
