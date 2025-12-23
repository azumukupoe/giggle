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

                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        placeholder={t('feed.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // Reset page on search
                        }}
                        className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-white/20 transition-all"
                    />
                </div>
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
                <div className="flex items-center justify-center gap-4 mt-12">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6 text-gray-900 dark:text-white" />
                    </button>

                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                        Page {currentPage} of {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-6 h-6 text-gray-900 dark:text-white" />
                    </button>
                </div>
            )}
        </div>
    );
};
