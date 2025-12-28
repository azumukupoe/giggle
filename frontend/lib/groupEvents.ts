import { Event, GroupedEvent } from "@/types/event";

/**
 * Extracts a grouping key from an event URL.
 * Events with the same key are considered the same event with different ticket types.
 */
export function getEventGroupKey(url: string): string {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        // Eplus: https://eplus.jp/sf/detail/0344660008-P0030026P021003
        // Group key: base before the last P-prefixed segment
        if (hostname.includes('eplus.jp')) {
            const pathMatch = url.match(/\/sf\/detail\/([^/]+)/);
            if (pathMatch) {
                const fullCode = pathMatch[1];
                // Pattern: {code}-{sub}P{variant} -> group by {code}-{sub} without the P{variant}
                // Example: 0344660008-P0030026P021003 -> 0344660008-P0030026
                const baseMatch = fullCode.match(/^(.+?P\d+)P\d+$/);
                if (baseMatch) {
                    return `eplus:${baseMatch[1]}`;
                }
                // Fallback: entire code is the key (no variant suffix)
                return `eplus:${fullCode}`;
            }
        }

        // Pia: https://ticket.pia.jp/pia/ticketInformation.do?eventCd=2512317&...
        // Group key: eventCd parameter
        if (hostname.includes('pia.jp')) {
            const eventCd = urlObj.searchParams.get('eventCd');
            if (eventCd) {
                return `pia:${eventCd}`;
            }
        }

        // Default: use full URL as key (no grouping)
        return url;
    } catch {
        return url;
    }
}

/**
 * Groups events by their event group key.
 * Events with the same key are merged into a single GroupedEvent.
 */
export function groupEvents(events: Event[]): GroupedEvent[] {
    const grouped = new Map<string, { event: Event; urls: string[] }>();

    for (const event of events) {
        // Create a composite key that includes the date to distinguish differnt start times
        const baseKey = getEventGroupKey(event.url);
        const key = `${baseKey}_${event.date}`;

        if (grouped.has(key)) {
            // Add URL to existing group
            const existing = grouped.get(key)!;
            if (!existing.urls.includes(event.url)) {
                existing.urls.push(event.url);
            }
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
