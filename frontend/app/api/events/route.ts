
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { groupEvents } from "@/lib/groupEvents";
import { createIsoDate, mergeEventNames } from "@/lib/eventUtils";
import { getTimezoneOffset } from "@/lib/timezoneUtils";
import { Event } from "@/types/event";
import { unstable_cache } from "next/cache";

export const dynamic = 'force-dynamic';

// Cache: Fetch, Group, Filter
const getCachedGroupedEvents = unstable_cache(
    async () => {
        // Fetch future events
        let allData: Event[] = [];
        let hasMore = true;
        let p = 0;
        const pageSize = 1000;

        // Get today
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        while (hasMore) {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .gte('date', todayStr)
                .order('date', { ascending: true })
                .order('time', { ascending: true })
                .order('url', { ascending: true })
                .range(p * pageSize, (p + 1) * pageSize - 1);

            if (error) {
                console.error("Error fetching events:", error);
                throw error;
            }

            if (data) {
                allData = [...allData, ...(data as Event[])];
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    p++;
                }
            } else {
                hasMore = false;
            }
        }

        // 1. Group
        const grouped = groupEvents(allData);

        // Filter past
        // Use 'now'
        const timeFiltered = grouped.map(group => {
            const validDates = group.displayDates.filter(dStr => {
                // If it has a time, check if it's in the future
                if (dStr.includes("T")) {
                    let dateStr = dStr;
                    // Check if timezone info is missing
                    if (!/[+-]\d{2}:?\d{2}|Z$/.test(dateStr)) {
                        // Dynamically determine timezone based on location
                        // We need the location from the event. But 'group.displayDates' doesn't have it direct mapping easily here?
                        // 'group' is already grouped.
                        // Wait, 'validDates' iteration is just string filtering.
                        // We need to know WHICH event this date belongs to to get the location.
                        // But we are iterating dates first.

                        // Actually, looking at lines 71-75, we filter events LATER based on these valid dates.
                        // This structure is: Filter Dates -> Filter Events -> Re-derive metadata.

                        // If we filter dates first without knowing the location, we can't apply the correct timezone.
                        // We should probably rely on the *Group's* location if reasonable, or checking the source events.

                        // Option: Use group.venue or group.location (baseEvent location) as a proxy.
                        // Since they are grouped by venue/location match, the group location should be representative.

                        const offset = getTimezoneOffset(dateStr, group.location || "");
                        dateStr += offset;
                    }
                    const dt = new Date(dateStr);
                    return dt > now;
                }
                return true;
            });

            // Filter URLs
            const validDateSet = new Set(validDates);
            const validEvents = group.sourceEvents
                .filter(ev => {
                    const dStr = createIsoDate(ev.date, ev.time);
                    return validDateSet.has(dStr);
                });

            // Deduplicate URLs
            const uniqueUrls = Array.from(new Set(validEvents.map(ev => ev.url)));

            // Recalc Metadata
            // Use ALL source events for name resolution to capture case variations
            const validEventNames = new Set(group.sourceEvents.map(ev => ev.event));
            const validPerformers = new Set(validEvents.map(ev => ev.performer));

            // Update sort keys
            const firstDateStr = validDates[0];
            let newDate = group.date;
            let newTime = group.time;

            if (firstDateStr) {
                if (firstDateStr.includes("T")) {
                    const parts = firstDateStr.split("T");
                    newDate = parts[0];
                    newTime = parts[1];
                } else {
                    newDate = firstDateStr;
                    newTime = null;
                }
            }

            return {
                ...group,
                event: mergeEventNames(validEventNames),
                performer: Array.from(validPerformers).filter(Boolean).join("\n\n"),
                displayDates: validDates,
                urls: uniqueUrls,
                date: newDate,
                time: newTime
            };
        }).filter(group => group.displayDates.length > 0);

        return timeFiltered;
    },
    ['all-grouped-events'], // Cache key
    { revalidate: 60 } // Revalidate every 60 seconds
);

export async function GET() {
    try {

        // Get cached result
        const timeFiltered = await getCachedGroupedEvents();

        // Always return all events (client-side filtering)
        return NextResponse.json({
            events: timeFiltered,
            total: timeFiltered.length
        });

    } catch (e) {
        console.error("API Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
