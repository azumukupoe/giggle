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
        const dateTimeStr = createIsoDate(event.date, event.time);

        // Determine if current event is a range
        const isEventRange = differenceInCalendarDays(eventEndDate, eventDate) > 0;

        let matched = false;

        // Helper to perform matching logic
        const checkMatch = (group: IntermediateGroup): boolean => {
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

            if (locationConflict) return false;

            // 2. Venue Matching
            const strictVenueMatch = Array.from(group.venues).some(v => areStringsSimilar(v, event.venue));

            const partialVenueMatch = Array.from(group.venues).some(v => {
                const norm1 = normalizeVenue(v);
                const norm2 = normalizeVenue(event.venue);
                const common = getCommonSubstring([norm1, norm2]);
                const isNonAscii = /[^\x00-\x7F]/.test(common);
                if (isNonAscii) return common.length >= 2;
                return common.length >= 5;
            });

            // --- Pass 1 Check: Strict Event Name Match ---
            const name1 = event.event;
            const baseName1 = getEventBaseName(name1);
            const pass1Match = Array.from(group.eventNames).some(n => getEventBaseName(n) === baseName1);

            // --- Pass 2 Check: Fuzzy Match (Event or Performer) ---
            const n1Norm = normalizeEventName(baseName1);
            const perf1 = event.performer;
            const p1Norm = perf1 ? normalizeEventName(perf1) : "";

            const fuzzyEventMatch = Array.from(group.eventNames).some(n =>
                areStringsSimilar(normalizeEventName(getEventBaseName(n)), n1Norm)
            );

            const fuzzyPerformerMatch =
                Array.from(group.performers).some(p => areStringsSimilar(normalizeEventName(p), n1Norm)) ||
                (perf1 ? Array.from(group.eventNames).some(n => areStringsSimilar(normalizeEventName(getEventBaseName(n)), p1Norm)) : false) ||
                (perf1 ? Array.from(group.performers).some(p => areStringsSimilar(normalizeEventName(p), p1Norm)) : false);

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

                // Does this event contain the group? (Using group's latest date as proxy, or scan all? Scan all for safety)
                // Actually if THIS event is a range, we check if it covers ANY of the group's dates?
                // For simplicity, checking if it covers the `latestDate` of the group is usually enough for sorted events.
                // But let's check basic range overlap: StartA <= EndB && StartB <= EndA
                // We have `group.latestDate`... we'd ideally want group's full range.
                // But `checkCoverage` logic above handles "Group is Range, Event is Point".

                let isGroupContainedInEvent = false;
                if (isEventRange) {
                    // Check if event range covers group.latestDate
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
                group.eventNames.add(event.event);
                if (event.performer) group.performers.add(event.performer);
                group.venues.add(event.venue);
                if (event.location) group.locations.add(event.location);
                group.dates.add(dateTimeStr);
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

        // Pass 2: If not matched, check known "Range Groups" (that might be older than 1 day)
        if (!matched) {
            for (const group of rangeGroups) {
                // Skip if we already checked it in the loop above?
                // The loop above only checks things with diff <= 1. 
                // If a range group is recent, it was checked.
                // If it's old (diff > 1), it wasn't checked. 
                // So valid to check here.
                // But we should check diff to avoid checking it twice? 
                // Or just check match. `checkMatch` is cheap enough?
                // Let's rely on calculating diff again to skip if <= 1 (already checked)
                const diff = Math.abs(differenceInCalendarDays(eventDate, group.latestDate));
                if (diff <= 1) continue; // Already checked in main loop

                // Also optimization: If eventDate is WAY past the group's possible range?
                // But we don't track group's max date easily here without inspecting all dates.
                // Assuming `rangeGroups` is not huge, just check.

                if (checkMatch(group)) {
                    group.urls.add(event.url);
                    group.eventNames.add(event.event);
                    if (event.performer) group.performers.add(event.performer);
                    group.venues.add(event.venue);
                    if (event.location) group.locations.add(event.location);
                    group.dates.add(dateTimeStr);
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
                eventNames: new Set([event.event]),
                performers: new Set(event.performer ? [event.performer] : []),
                venues: new Set([event.venue]),
                locations: new Set(event.location ? [event.location] : []),
                dates: new Set([dateTimeStr]),
                sourceEvents: [event],
                latestDate: eventDate
            };

            groups.push(newGroup);
            if (isEventRange) {
                rangeGroups.push(newGroup);
            }
        }
    }

    // Pass 2: Group by Venue + Time (Existing Logic preserved? Or is it redundant?)
    // The original code had a comment "// Pass 2: Group by Venue + Time" but no code.
    // It just returned the map. So we proceed to mapping.

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
