
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { groupEvents } from "@/lib/groupEvents";
import { createIsoDate, mergeEventNames, compareGroupedEvents } from "@/lib/eventUtils";
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
                .order('time', { ascending: true, nullsFirst: true })
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
                    const dt = new Date(dStr);
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
                performer: Array.from(validPerformers).join("\n\n"),
                displayDates: validDates,
                urls: uniqueUrls,
                date: newDate,
                time: newTime
            };
        }).filter(group => group.displayDates.length > 0)
            .sort(compareGroupedEvents);

        return timeFiltered;
    },
    ['all-grouped-events'], // Cache key
    { revalidate: 60 } // Revalidate every 60 seconds
);

export async function GET(request: NextRequest) {
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
