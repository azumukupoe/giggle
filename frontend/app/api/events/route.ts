
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { groupEvents } from "@/utils/groupEvents";
import { getStartDate } from "@/utils/eventUtils";

import { Event, GroupedEvent } from "@/types/event";
import { unstable_cache } from "next/cache";

export const dynamic = 'force-dynamic';

const getCachedGroupedEvents = unstable_cache(
    async () => {
        // Get Supabase client at runtime (not module load time)
        const supabase = getServerSupabase();
        
        // Fetch future events
        let allData: Event[] = [];
        let hasMore = true;
        let p = 0;
        const pageSize = 1000;


        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        while (hasMore) {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .order('date', { ascending: true })
                .order('time', { ascending: true })
                .order('url', { ascending: true })
                .range(p * pageSize, (p + 1) * pageSize - 1);

            if (error) {
                console.error("Error fetching events:", error);
                throw error;
            }

            if (data) {
                // Ensure correct types (map nullable format to expected format)
                const mapped = data.map((d: Record<string, unknown>) => ({
                    ...d,
                    venue: (d.venue as string[]) || [],
                    location: (d.location as string[]) || [],
                })) as Event[];

                allData = [...allData, ...mapped];
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    p++;
                }
            } else {
                hasMore = false;
            }
        }

        // Logic simplifed: No need to fetch/join locations or venues tables anymore

        const grouped = groupEvents(allData);

        const timeFiltered = grouped.map(group => {
            const futureDates = group.displayDates.filter(dStr => {
                const isFuture = (str: string) => {
                    if (str.includes("T")) {
                        let dateStr = str;
                        if (!/[+-]\d{2}:?\d{2}|Z$/.test(dateStr)) {
                            const offset = '+09:00';
                            dateStr += offset;
                        }
                        const dt = new Date(dateStr);
                        return dt > now;
                    } else {
                        return str >= todayStr;
                    }
                };

                if (dStr.includes(" ")) {
                    const parts = dStr.split(" ");
                    return parts.some(p => isFuture(p));
                }

                return isFuture(dStr);
            });

            if (futureDates.length === 0) {
                return null;
            }

            // We want to sort by the NEXT upcoming date, so update header date/time
            const firstDateStr = futureDates[0];
            let newDate = group.date;
            let newTime = group.time;

            if (firstDateStr) {
                if (firstDateStr.includes("T")) {
                    const parts = firstDateStr.split("T");
                    newDate = [parts[0]];
                    newTime = [parts[1]];
                } else {
                    newDate = [firstDateStr];
                    // Only reset time if using a date-only string? 
                    // Actually, if we have a specific date string, we often lose the specific time associated with the "original" start date.
                    // But for sorting purposes, this is fine.
                    newTime = null;
                }
            }

            return {
                ...group,
                date: newDate,
                time: newTime,
                // KEEP original displayDates and sourceEvents to show full range history
                // displayDates: validDates, <--- CHANGED: Use original group.displayDates
                // urls: uniqueUrls, <--- CHANGED: Use original group.urls
                // sourceEvents: validEvents <--- CHANGED: Use original group.sourceEvents
            };
        }).filter(group => group !== null) as unknown as GroupedEvent[];

        timeFiltered.sort((a, b) => {
            // Sort by earliest date in the range, not just the next upcoming date
            const getEarliest = (e: GroupedEvent) => {
                const dates = (e.displayDates && e.displayDates.length > 0)
                    ? e.displayDates
                    : e.date;
                return getStartDate(dates).getTime();
            };

            const dateA = getEarliest(a);
            const dateB = getEarliest(b);
            return dateA - dateB;
        });

        return timeFiltered;
    },
    ['all-grouped-events'],
    { revalidate: 60 }
);

export async function GET() {
    try {
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
