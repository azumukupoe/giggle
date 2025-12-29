import { Event, GroupedEvent } from "@/types/event";

/**
 * Groups events strictly by start time (date) and venue.
 * This ensures that multiple ticket types for the same event are displayed as one card.
 */
export function groupEvents(events: Event[]): GroupedEvent[] {
    const grouped = new Map<string, { event: Event; urls: string[] }>();

    for (const event of events) {
        // Group strictly by date and venue
        // Normalize venue? For now assume exact match or close enough.
        // Key format: "${date}_${venue}"
        // Note: Event.date is an ISO string from JSON response usually

        let dateKey = "";
        try {
            // Ensure we use the ISO string if it's a Date object or string
            dateKey = new Date(event.date).toISOString();
        } catch {
            dateKey = String(event.date);
        }

        const key = `${dateKey}_${event.venue}`;

        if (grouped.has(key)) {
            // Add URL to existing group
            const existing = grouped.get(key)!;
            // Only add unique URLs
            if (!existing.urls.includes(event.url)) {
                existing.urls.push(event.url);
            }
            // Optionally: Could update title to the longest one if desired?
            // But usually the first one found is sufficient.
        } else {
            // Create new group
            grouped.set(key, {
                event,
                urls: [event.url]
            });
        }
    }

    // Convert map to GroupedEvent array
    return Array.from(grouped.values()).map(({ event, urls }) => ({
        id: event.id,
        title: event.title,
        artist: event.artist,
        venue: event.venue,
        location: event.location,
        date: event.date,
        urls
    }));
}
