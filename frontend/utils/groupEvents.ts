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

        // Determine if current event is a range
        const isEventRange = differenceInCalendarDays(eventEndDate, eventDate) > 0;

        let matched = false;

        // Helper to perform matching logic
        const checkMatch = (group: IntermediateGroup): boolean => {
            // 1. Location Logic
            let locationConflict = false;
            let hasCommonLocation = false;

            if (event.location && event.location.length > 0) {
                const locs1 = event.location.map(l => normalizeLocation(l)).filter(Boolean);

                if (locs1.length > 0 && group.locations.size > 0) {
                    const groupLocs = Array.from(group.locations).map(l => normalizeLocation(l)).filter(Boolean);

                    const hasOverlap = locs1.some(l1 => groupLocs.includes(l1));

                    if (!hasOverlap) {
                        locationConflict = true;
                    } else {
                        hasCommonLocation = true;
                    }
                }
            }


            if (locationConflict) return false;

            // 2. Venue Matching
            const eventVenues = event.venue || [];

            const strictVenueMatch = Array.from(group.venues).some(v => {
                return eventVenues.some(evV => areStringsSimilar(v, evV));
            });

            const partialVenueMatch = Array.from(group.venues).some(v => {
                return eventVenues.some(evV => {
                    const norm1 = normalizeVenue(v);
                    const norm2 = normalizeVenue(evV);
                    const common = getCommonSubstring([norm1, norm2]);
                    const isNonAscii = /[^\x00-\x7F]/.test(common);
                    if (isNonAscii) return common.length >= 2;
                    return common.length >= 5;
                });
            });

            // --- Pass 1 Check: Strict Event Name Match ---
            const name1List = event.event || [];
            const pass1Match = name1List.some(n1 => {
                const base1 = getEventBaseName(n1);
                return Array.from(group.eventNames).some(n2 => getEventBaseName(n2) === base1);
            });

            // --- Pass 2 Check: Fuzzy Match (Event or Performer) ---
            const perf1List = event.performer || [];

            const fuzzyEventMatch = name1List.some(n1 => {
                const n1Norm = normalizeEventName(getEventBaseName(n1));
                return Array.from(group.eventNames).some(n =>
                    areStringsSimilar(normalizeEventName(getEventBaseName(n)), n1Norm)
                );
            });

            const fuzzyPerformerMatch =
                // Group performers vs Event Name Match
                Array.from(group.performers).some(p =>
                    name1List.some(n1 => areStringsSimilar(normalizeEventName(p), normalizeEventName(getEventBaseName(n1))))
                ) ||
                // Group Names vs Event Perf Match
                (perf1List.length > 0 && Array.from(group.eventNames).some(n =>
                    perf1List.some(p1 => areStringsSimilar(normalizeEventName(getEventBaseName(n)), normalizeEventName(p1)))
                )) ||
                // Group Perf vs Event Perf Match
                (perf1List.length > 0 && Array.from(group.performers).some(p =>
                    perf1List.some(p1 => areStringsSimilar(normalizeEventName(p), normalizeEventName(p1)))
                ));

            const pass2Match = fuzzyEventMatch || fuzzyPerformerMatch;

            const venueOk = (pass1Match && partialVenueMatch) || strictVenueMatch;
            let shouldMerge = venueOk && (pass1Match || pass2Match);

            // Special handling for "Pass Tickets" (Date Range Containment)
            if (!shouldMerge && pass1Match && strictVenueMatch) {
                const checkCoverage = (rangeDateStr: string, targetDate: Date) => {
                    const parts = rangeDateStr.split(/\s+/);
                    if (parts.length >= 2) {
                        const start = getStartDate(parts[0]);
                        const end = getStartDate(parts[parts.length - 1]);
                        return targetDate >= start && targetDate <= end;
                    }
                    return false;
                };

                // Does group contain this event?
                const isContainedInGroup = Array.from(group.dates).some(d => checkCoverage(d.split('T')[0], eventDate));

                // Does this event contain the group?
                let isGroupContainedInEvent = false;
                if (isEventRange) {
                    isGroupContainedInEvent = eventDate <= group.latestDate && eventEndDate >= group.latestDate;
                }

                if (isContainedInGroup || isGroupContainedInEvent) {
                    shouldMerge = true;
                }
            }

            return shouldMerge;
        };

        // Pass 1: Check recent groups (Optimization: only look back 1 day)
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));

            if (diff > 1) {
                // Optimization: Stop looking back in the main list
                break;
            }

            if (checkMatch(group)) {
                // Merge Logic
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

                    // Already in rangeGroups
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

            // Resolve Venue
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
                displayDates: filterRedundantDates(Array.from(g.dates))
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
