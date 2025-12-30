import { differenceInCalendarDays, parseISO } from "date-fns";
import { Event, GroupedEvent } from "@/types/event";

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

    for (const event of sortedEvents) {
        const normVenue = normalizeVenue(event.venue);
        const normTitle = normalizeTitle(event.title);
        const eventDate = parseISO(event.date);

        let matched = false;

        // Iterate backwards to find the most recent candidate
        for (let i = pass1Groups.length - 1; i >= 0; i--) {
            const group = pass1Groups[i];

            if (group.venueNormalized !== normVenue) continue;

            const groupTitleSample = group.baseEvent.title;
            if (normalizeTitle(groupTitleSample) !== normTitle) continue;

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
                const dateTimeStr = event.time ? `${event.date}T${event.time}` : event.date;
                group.dates.add(dateTimeStr);
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
                titles: new Set([event.title]),
                artists: new Set([event.artist]),
                dates: new Set([dateTimeStr])
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
        title: mergeTitles(g.titles),
        artist: Array.from(g.artists).join("\n\n"),
        venue: g.baseEvent.venue,
        location: g.baseEvent.location,
        date: g.baseEvent.date, // Use earliest date for sorting usually?
        urls: Array.from(g.urls),
        displayDates: Array.from(g.dates).sort() // Sorted list for display
    }));
}

function mergeTitles(titlesSet: Set<string>): string {
    const titles = Array.from(titlesSet);
    // Filter out any title that is strictly contained in another title
    // Example: "A" vs "A / B" -> "A" is in "A / B", so we keep "A / B" and drop "A"
    // Wait, requirement is: "CHAQLA. ONE MAN..." vs "CHAQLA." -> Display "CHAQLA. ONE MAN..."
    const uniqueTitles = titles.filter(t1 => {
        // If t1 is contained in any OTHER title t2, drop t1.
        return !titles.some(t2 => t2 !== t1 && t2.includes(t1));
    });

    return uniqueTitles.join(" / ");
}
