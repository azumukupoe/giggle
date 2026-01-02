
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { EventCard } from "./EventCard";
import { GroupedEvent } from "@/types/event";
import { useLanguage } from "./LanguageContext";
import { Search } from "lucide-react";
import { normalizeJapanese } from "../lib/stringUtils";

export const Feed = () => {
    const { t } = useLanguage();

    // Data State
    const [allGroupedEvents, setAllGroupedEvents] = useState<GroupedEvent[]>([]);
    const [displayedEvents, setDisplayedEvents] = useState<GroupedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    const toggleFilter = (filter: string) => {
        setActiveFilters(prev => {
            const newFilters = prev.includes(filter)
                ? prev.filter(f => f !== filter)
                : [...prev, filter];
            setCurrentPage(1); // Reset to page 1 on filter change
            return newFilters;
        });
    };

    // Debounce search query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
            setCurrentPage(1); // Reset page on search change
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);

    // Fetch ALL pre-grouped events on mount
    useEffect(() => {
        let ignore = false;

        const fetchEvents = async () => {
            setLoading(true);

            try {
                // Fetch ALL events (already grouped by server)
                const response = await fetch(`/api/events?all=true`);
                if (!response.ok) {
                    throw new Error("Failed to fetch events");
                }

                const data = await response.json();

                if (!ignore) {
                    setAllGroupedEvents(data.events || []);
                }
            } catch (error) {
                console.error("Error loading events:", error);
                if (!ignore) {
                    setAllGroupedEvents([]);
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        };

        fetchEvents();

        return () => {
            ignore = true;
        };
    }, []);

    // Client-side filtering and pagination
    const filteredEvents = useMemo(() => {
        if (!debouncedSearchQuery && activeFilters.length === 0) {
            return allGroupedEvents;
        }

        const lowerQ = normalizeJapanese(debouncedSearchQuery);

        return allGroupedEvents.filter(e => {
            const searchAll = activeFilters.length === 0;

            const matchEvent = (searchAll || activeFilters.includes('event')) &&
                normalizeJapanese(e.event).includes(lowerQ);

            const matchPerformer = (searchAll || activeFilters.includes('performer')) &&
                normalizeJapanese(e.performer).includes(lowerQ);

            const matchVenue = (searchAll || activeFilters.includes('venue')) &&
                normalizeJapanese(e.venue).includes(lowerQ);

            const matchLocation = (searchAll || activeFilters.includes('location')) &&
                normalizeJapanese(e.location).includes(lowerQ);

            const matchDate = (searchAll || activeFilters.includes('date')) && (
                normalizeJapanese(e.date).includes(lowerQ) ||
                e.displayDates.some(d => normalizeJapanese(d).includes(lowerQ))
            );

            return matchEvent || matchPerformer || matchVenue || matchLocation || matchDate;
        });
    }, [allGroupedEvents, debouncedSearchQuery, activeFilters]);

    // Apply pagination
    const totalEvents = filteredEvents.length;
    const totalPages = Math.ceil(totalEvents / itemsPerPage);

    useEffect(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paged = filteredEvents.slice(startIndex, startIndex + itemsPerPage);
        setDisplayedEvents(paged);
    }, [filteredEvents, currentPage, itemsPerPage]);

    // Scroll to top when displayed events change (only if page changed or filters drastically changed)
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [currentPage]); // Only scroll on page change to avoid jarring jumps on typing

    if (loading && allGroupedEvents.length === 0) {
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
                            // Page reset handled in debounce effect
                        }}
                        placeholder={t('feed.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                </div>
                <p className="text-right text-xs text-muted-foreground px-1 h-4">
                    {filteredEvents.length > 0 && t('feed.eventsFound', { count: filteredEvents.length })}
                </p>
                {/* Search Filters */}
                <div className="max-w-xl mx-auto mb-6 w-full shrink-0 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2 justify-center">
                        <span className="text-sm text-muted-foreground mr-2 self-center">{t('search.filterBy')}</span>
                        {['event', 'performer', 'venue', 'location', 'date'].map((filter) => (
                            <button
                                key={filter}
                                onClick={() => toggleFilter(filter)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${activeFilters.includes(filter)
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
                                    }`}
                            >
                                {t(`search.${filter}`)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden px-1">
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
