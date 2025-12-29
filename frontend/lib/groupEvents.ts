import { differenceInCalendarDays, parseISO } from "date-fns";

const normalizeVenue = (venue: string): string => {
    return venue
        .toLowerCase()
        .replace(/,?\s*japan$/, "")
        .trim();
};

const normalizeTitle = (title: string): string => {
    return title.toLowerCase().trim();
};

interface IntermediateGroup {
    baseEvent: Event;
    urls: Set<string>;
    titles: Set<string>;
    artists: Set<string>;
    dates: Set<string>; // Set of ISO strings
    venueNormalized: string;
}

export function groupEvents(events: Event[]): GroupedEvent[] {
    if (events.length === 0) return [];

    // Sort by date first to make consecutive check easier
    const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // --- Pass 1: Group by Title + Venue (detecting consecutive days) ---
    const pass1Groups: IntermediateGroup[] = [];

    // Helper to find a matching group for Pass 1
    // We look for a group with same Normalized Venue AND Same Normalized Title
    // AND the last date in that group is same or 1 day before current event
    for (const event of sortedEvents) {
        const normVenue = normalizeVenue(event.venue);
        const normTitle = normalizeTitle(event.title);
        const eventDate = parseISO(event.date);

        // Try to find an existing group to merge into
        // Since input is sorted, we mostly care about the 'latest' groups or iterate backwards?
        // Actually, for "consecutive" logic, we usually want to attach to the most recent matching group.
        let matched = false;

        // Iterate backwards to find the most recent candidate
        for (let i = pass1Groups.length - 1; i >= 0; i--) {
            const group = pass1Groups[i];

            if (group.venueNormalized !== normVenue) continue;

            //Check Title Match
            // (In pass 1 we require title match to group consecutive dates)
            const groupTitleSample = group.baseEvent.title; // or check set?
            if (normalizeTitle(groupTitleSample) !== normTitle) continue;

            // Check Date (Same or Consecutive)
            // We check against ALL dates in the group? Or just the latest?
            // Since events are sorted, checking the latest added date (max in set) is sufficient.
            // But let's be safe and check if *any* date in group allows continuity.
            // Actually, simplified: check if eventDate is same day or +1 day from ANY date in group.
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
                group.titles.add(event.title);
                group.artists.add(event.artist);
                group.dates.add(event.date);
                matched = true;
                break; // Stop looking after finding match
            }
        }

        if (!matched) {
            // Create new group
            pass1Groups.push({
                baseEvent: event,
                venueNormalized: normVenue,
                urls: new Set([event.url]),
                titles: new Set([event.title]),
                artists: new Set([event.artist]),
                dates: new Set([event.date])
            });
        }
    }

    // --- Pass 2: Group by Venue + Time Signature ---
    // Now we have "Event Runs" (e.g. "Tour A at Zepp (Jan 1, Jan 2)").
    // We want to merge "Event A (Source 1)" and "Event A (Source 2)" if they are effectively the same.
    // Logic: Same Venue AND Same Set of Dates.

    // We can use a map keyed by "Venue_DateSig"
    // DateSig could be sorted joined timestamps.
    const pass2Map = new Map<string, IntermediateGroup>();
    const finalGroups: IntermediateGroup[] = []; // To preserve some order if map messes it up? No map is fine.

    for (const group of pass1Groups) {
        const dateSig = Array.from(group.dates).sort().join("|");
        const key = `${group.venueNormalized}__${dateSig}`;

        if (pass2Map.has(key)) {
            const existing = pass2Map.get(key)!;
            // Merge
            group.urls.forEach(u => existing.urls.add(u));
            group.titles.forEach(t => existing.titles.add(t));
            group.artists.forEach(a => existing.artists.add(a));
            group.dates.forEach(d => existing.dates.add(d));
        } else {
            pass2Map.set(key, group);
        }
    }

    // Convert back to Array
    return Array.from(pass2Map.values()).map(g => ({
        id: g.baseEvent.id, // Use ID of first event
        title: Array.from(g.titles).join(" / "),
        artist: Array.from(g.artists).join(" / "),
        venue: g.baseEvent.venue,
        location: g.baseEvent.location,
        date: g.baseEvent.date, // Use earliest date for sorting usually?
        urls: Array.from(g.urls),
        displayDates: Array.from(g.dates).sort() // Sorted list for display
    }));
}
