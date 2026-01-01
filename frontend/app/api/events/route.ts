
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { groupEvents } from "@/lib/groupEvents";
import { createIsoDate, mergeEventNames, compareGroupedEvents } from "@/lib/eventUtils";
import { Event } from "@/types/event";
import { unstable_cache } from "next/cache";

export const dynamic = 'force-dynamic';

// Cache the heavy lifting: Fetching, Grouping, and Initial Filtering
const getCachedGroupedEvents = unstable_cache(
    async () => {
        // Fetch all future events
        let allData: Event[] = [];
        let hasMore = true;
        let p = 0;
        const pageSize = 1000;

        // Get "today" in YYYY-MM-DD
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

        // 1. Group Events
        const grouped = groupEvents(allData);

        // 2. Filter out past occurrences (Time filtering)
        // We use 'now' from the time of execution.
        const timeFiltered = grouped.map(group => {
            const validDates = group.displayDates.filter(dStr => {
                // If it has a time, check if it's in the future
                if (dStr.includes("T")) {
                    const dt = new Date(dStr);
                    return dt > now;
                }
                return true;
            });

            // Filter URLs based on validDates
            const validDateSet = new Set(validDates);
            const validEvents = group.sourceEvents
                .filter(ev => {
                    const dStr = createIsoDate(ev.date, ev.time);
                    return validDateSet.has(dStr);
                });

            // Deduplicate URLs
            const uniqueUrls = Array.from(new Set(validEvents.map(ev => ev.url)));

            // Recalculate Event Names and Performers
            const validEventNames = new Set(validEvents.map(ev => ev.event));
            const validPerformers = new Set(validEvents.map(ev => ev.performer));

            // Update date and time for sorting
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
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "9");
        const searchQuery = (searchParams.get("search") || "").toLowerCase();
        const filters = searchParams.get("filters")?.split(",").filter(Boolean) || [];
        const returnAll = searchParams.get("all") === "true";

        // Get cached result
        const timeFiltered = await getCachedGroupedEvents();

        if (returnAll) {
            return NextResponse.json({
                events: timeFiltered,
                total: timeFiltered.length
            });
        }

        // 3. Search / Advanced Filters
        let finalEvents = timeFiltered;
        if (searchQuery) {
            finalEvents = finalEvents.filter(e => {
                const searchAll = filters.length === 0;

                const matchEvent = (searchAll || filters.includes('event')) &&
                    e.date.toLowerCase().includes(searchQuery) ||
                    e.displayDates.some(d => d.toLowerCase().includes(searchQuery))
                );

            return matchEvent || matchPerformer || matchVenue || matchLocation || matchDate;
        });
    }

        // 4. Pagination
        const total = finalEvents.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginated = finalEvents.slice(startIndex, startIndex + limit);

    return NextResponse.json({
        events: paginated,
        page,
        limit,
        total,
        totalPages
    });

} catch (e) {
    console.error("API Error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
}
