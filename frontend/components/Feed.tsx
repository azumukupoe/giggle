"use client";

import { useEffect, useState } from "react";
import { EventCard } from "./EventCard";
import { Event } from "@/types/event";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "./LanguageContext";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export const Feed = () => {
    const { t } = useLanguage();

    // Data State
    const [allEvents, setAllEvents] = useState<Event[]>([]);
    const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);

            // Query Supabase (Fetch all items for client-side search)
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .gte('date', new Date().toISOString())
                .order('date', { ascending: true })
                .limit(10000);

            if (error) {
                console.error("Error fetching events:", error);
                setAllEvents([]);
            } else {
                setAllEvents(data as any as Event[]);
            }
            setLoading(false);
        };

        fetchEvents();
    }, []);

    // Filter & Paginate
    useEffect(() => {
        let filtered = allEvents;

        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            filtered = allEvents.filter(e =>
                e.title.toLowerCase().includes(lowerQ) ||
                e.artist.toLowerCase().includes(lowerQ) ||
                e.venue.toLowerCase().includes(lowerQ) ||
                e.location.toLowerCase().includes(lowerQ)
            );
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const paged = filtered.slice(startIndex, startIndex + itemsPerPage);

        setDisplayedEvents(paged);
    }, [allEvents, searchQuery, currentPage]);

    const totalPages = Math.ceil(
        (searchQuery
            ? allEvents.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase())).length
            : allEvents.length
        ) / itemsPerPage
    );

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-96 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Controls */}
            <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                    {/* Removed auth message, just search bar is focus now */}
                </div>
            </div>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto mb-8 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1); // Reset page on search
                    }}
                    placeholder={t('feed.searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedEvents.length > 0 ? (
                    displayedEvents.map((event) => (
                        <EventCard key={event.id || event.external_id} event={event} />
                    ))
                ) : (
                    <div className="col-span-full text-center text-gray-500 py-20 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-200 dark:border-white/10">
                        <p className="text-xl">{t('feed.noEvents')}</p>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-12">
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
