
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { groupEvents } from "@/utils/groupEvents";
import { createIsoDate, mergeEventNames } from "@/utils/eventUtils";

import { Event } from "@/types/event";
import { unstable_cache } from "next/cache";

export const dynamic = 'force-dynamic';

const getCachedGroupedEvents = unstable_cache(
    async () => {
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

                .order('url', { ascending: true })
                .range(p * pageSize, (p + 1) * pageSize - 1);

            if (error) {
                console.error("Error fetching events:", error);
                throw error;
            }

            if (data) {
                allData = [...allData, ...(data as unknown as Event[])];
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    p++;
                }
            } else {
                hasMore = false;
            }
        }

        const { data: locationsData } = await supabase
            .from('locations')
            .select('id, name_en, name_ja');

        const locationMap = new Map<string, { en: string; ja: string }>();
        if (locationsData) {
            locationsData.forEach(l => {
                locationMap.set(l.id, {
                    en: l.name_en || l.name_ja || '',
                    ja: l.name_ja || l.name_en || ''
                });
            });
        }

        const { data: venuesData } = await supabase
            .from('venues')
            .select('id, variation, name_en, name_ja');

        const venueMap = new Map<string, { en: string; ja: string }>();
        if (venuesData) {
            venuesData.forEach(v => {
                // Priority: name_en/ja -> variation[0]
                const fallback = (v.variation && v.variation.length > 0) ? v.variation[0] : '';
                const en = v.name_en || fallback || '';
                const ja = v.name_ja || fallback || '';
                venueMap.set(v.id, { en, ja });
            });
        }

        allData.forEach(e => {
            if (e.location && Array.isArray(e.location)) {
                const resolvedLocs = (e.location as unknown as string[]).map((uuid: string) => {
                    const found = locationMap.get(uuid);
                    if (found) return found;
                    return { en: uuid, ja: uuid }; // Fallback
                });
                // Cast to any to bypass TS complaining about string[] vs object[] during transition if not fully aligned
                (e.location as any) = resolvedLocs;
            } else {
                (e.location as any) = [];
            }

            const vUuid = e.venue as unknown as string;
            const foundVenue = venueMap.get(vUuid);
            if (foundVenue) {
                (e.venue as any) = foundVenue;
            } else {
                (e.venue as any) = { en: vUuid || '', ja: vUuid || '' };
            }
        });

        const grouped = groupEvents(allData);

        const timeFiltered = grouped.map(group => {
            const validDates = group.displayDates.filter(dStr => {
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

            const validDateSet = new Set(validDates);
            const validEvents = group.sourceEvents
                .filter(ev => {
                    return ev.date.some(d => {
                        const dStr = createIsoDate(d, ev.time);
                        return validDateSet.has(dStr);
                    });
                });

            const uniqueUrls = Array.from(new Set(validEvents.map(ev => ev.url)));

            const validEventNames = new Set(group.sourceEvents.flatMap(ev => ev.event || []));
            const validPerformers = new Set(validEvents.flatMap(ev => ev.performer || []));

            const firstDateStr = validDates[0];
            let newDate = group.date;
            let newTime = group.time;

            if (firstDateStr) {
                if (firstDateStr.includes("T")) {
                    const parts = firstDateStr.split("T");
                    newDate = [parts[0]];
                    newTime = parts[1];
                } else {
                    newDate = [firstDateStr];
                    newTime = null;
                }
            }

            return {
                ...group,
                event: mergeEventNames(validEventNames),
                performer: Array.from(validPerformers).filter(Boolean),
                displayDates: validDates,
                urls: uniqueUrls,
                date: newDate,
                time: newTime
            };
        }).filter(group => group.displayDates.length > 0);

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
