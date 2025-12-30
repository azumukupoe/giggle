"use client";

import { useEffect, useState, useMemo } from "react";
import { EventCard } from "./EventCard";
import { Event, GroupedEvent } from "@/types/event";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "./LanguageContext";
import { Search } from "lucide-react";
import { groupEvents, mergeTitles } from "@/lib/groupEvents";

export const Feed = () => {
    const { t } = useLanguage();

    // Data State
    const [allEvents, setAllEvents] = useState<Event[]>([]);
    const [displayedEvents, setDisplayedEvents] = useState<GroupedEvent[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

    // Debounce search query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);

            try {
                let allData: Event[] = [];
                let hasMore = true;
                let page = 0;
                const pageSize = 1000;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('events')
                        .select('*')
                        .gte('date', new Date().toISOString())
                        .order('date', { ascending: true })
                        .order('time', { ascending: true, nullsFirst: true })
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) {
                        console.error("Error fetching events:", error);
                        break;
                    }

                    if (data) {
                        allData = [...allData, ...(data as Event[])];
                        if (data.length < pageSize) {
                            hasMore = false;
                        } else {
                            page++;
                        }
                    } else {
                        hasMore = false;
                    }
                }
                setAllEvents(allData);
            } catch (error) {
                console.error("Unexpected error fetching events:", error);
                setAllEvents([]);
            }

            setLoading(false);
        };

        fetchEvents();
    }, []);

    // Memoized grouped and filtered events
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(new Date());
        }, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const filteredGroupedEvents = useMemo(() => {
        // First group events (raw, so date-only + date-time logic works)
        const grouped = groupEvents(allEvents);

        // Filter out started events from the groups
        const timeFiltered = grouped.map(group => {
            const validDates = group.displayDates.filter(dStr => {
                // If it has a time, check if it's in the future
                if (dStr.includes("T")) {
                    const dt = new Date(dStr);
                    return dt > now;
                }
                // If it's date-only, we generally keep it (until the day is over)
                // The DB query filters out past days. 
                // So for "today", we keep date-only entries until midnight usually.
                return true;
            });

            // Filter URLs based on validDates
            // Only keep URLs from source events that match the remaining dates
            const validDateSet = new Set(validDates);
            const validEvents = group.sourceEvents
                .filter(ev => {
                    const dStr = ev.time ? `${ev.date}T${ev.time}` : ev.date;
                    // If the exact date string is in validDates, keep the URL
                    // Note: validDates has already been filtered by 'now' AND by redundancy (in groupEvents)
                    // So if "Dec 30" was removed because "Dec 30 19:00" exists, the URL for "Dec 30" event will also be removed here.
                    return validDateSet.has(dStr);
                });

            // Deduplicate URLs
            const uniqueUrls = Array.from(new Set(validEvents.map(ev => ev.url)));

            // Recalculate Titles and Artists for the valid events
            const validTitles = new Set(validEvents.map(ev => ev.title));
            const validArtists = new Set(validEvents.map(ev => ev.artist));

            return {
                ...group,
                title: mergeTitles(validTitles),
                artist: Array.from(validArtists).join("\n\n"),
                displayDates: validDates,
                urls: uniqueUrls
            };
        }).filter(group => group.displayDates.length > 0);

        // Then filter by search query
        if (!debouncedSearchQuery) return timeFiltered;
        const lowerQ = debouncedSearchQuery.toLowerCase();
        return timeFiltered.filter(e =>
            e.title.toLowerCase().includes(lowerQ) ||
            e.artist.toLowerCase().includes(lowerQ) ||
            e.venue.toLowerCase().includes(lowerQ) ||
            e.location.toLowerCase().includes(lowerQ)
        );
    }, [allEvents, debouncedSearchQuery, now]);

    // Paginate filtered events
    useEffect(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paged = filteredGroupedEvents.slice(startIndex, startIndex + itemsPerPage);
        setDisplayedEvents(paged);
    }, [filteredGroupedEvents, currentPage, itemsPerPage]);

    const totalPages = useMemo(() =>
        Math.ceil(filteredGroupedEvents.length / itemsPerPage)
        , [filteredGroupedEvents.length, itemsPerPage]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <p className="text-xl text-muted-foreground animate-pulse">Loading events...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 h-full flex flex-col">
            {/* Controls */}
            <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                    {/* Removed auth message, just search bar is focus now */}
                </div>
            </div>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto mb-8 w-full shrink-0 flex flex-col gap-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // Reset page on search
                        }}
                        placeholder={t('feed.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                </div>
                <p className="text-right text-xs text-muted-foreground px-1 h-4">
                    {filteredGroupedEvents.length > 0 && `${filteredGroupedEvents.length} events found`}
                </p>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden px-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                    {displayedEvents.length > 0 ? (
                        displayedEvents.map((event) => (
                            <EventCard key={event.id} event={event} />
                        ))
                    ) : (
                        <div className="col-span-full text-center text-gray-500 py-20 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-200 dark:border-white/10">
                            <p className="text-xl">{t('feed.noEvents')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 pt-2 shrink-0">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80 transition-colors font-medium text-sm"
                    >
                        Previous
                    </button>
                    <span className="text-muted-foreground font-medium text-sm">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80 transition-colors font-medium text-sm"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};
