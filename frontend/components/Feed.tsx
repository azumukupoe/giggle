"use client";

import { useEffect, useState } from "react";
import { EventCard } from "./EventCard";
import { Event } from "@/types/event";
import { supabase } from "@/lib/supabase";
import { useSession } from "next-auth/react";
import { getFollowedArtists } from "@/lib/spotify";
import { useLanguage } from "./LanguageContext";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export const Feed = () => {
    const { data: session } = useSession();
    const { t } = useLanguage();

    // Data State
    const [allEvents, setAllEvents] = useState<Event[]>([]);
    const [displayedEvents, setDisplayedEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMessage, setFilterMessage] = useState("");

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            let artistFilter: string[] = [];

            if (session?.accessToken) {
                // 1. Get Followed Artists
                const followed = await getFollowedArtists(session.accessToken as string);
                if (followed.length > 0) {
                    artistFilter = followed;
                    setFilterMessage(t('feed.following').replace('{count}', followed.length.toString()));

                    // Sync logic (background)
                    try {
                        const artistsToInsert = followed.map((name: string) => ({ name }));
                        supabase.from('artists').upsert(artistsToInsert, { onConflict: 'name', ignoreDuplicates: true }).then(({ error }) => {
                            if (error) console.error("Error syncing artists to backend:", error);
                        });
                    } catch (err) {
                        console.error("Sync error:", err)
                    }

                } else {
                    setFilterMessage(t('feed.allEvents'));
                }
            } else {
                setFilterMessage(t('feed.connectPrompt'));
            }

            // 2. Query Supabase (Fetch more items to allow client-side search)
            // Ideally backend search is better, but for MVP client-side is faster to implement
            let query = supabase
                .from('events')
                .select('*')
                .order('date', { ascending: true })
                .limit(10000); // Fetch all (effectively) for client-side filtering

            if (artistFilter.length > 0) {
                query = query.in('artist', artistFilter);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Error fetching events:", error);
                setAllEvents([]);
            } else {
                setAllEvents(data as any as Event[]);
            }
            setLoading(false);
        };

        fetchEvents();
    }, [session, t]); // Add 't' dependency so message updates on language change

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
                    <div key={i} className="h-96 rounded-2xl bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Controls */}
            <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
                <p className="text-gray-400 text-sm">
                    {filterMessage}
                </p>

                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="text"
                        placeholder={t('feed.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // Reset page on search
                        }}
                        className="w-full pl-10 pr-4 py-2 rounded-full bg-white/10 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white/20 transition-all"
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
                    <div className="col-span-full text-center text-gray-500 py-20 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/10">
                        <p className="text-xl">{t('feed.noEvents')}</p>
                        <p className="text-sm mt-2">{t('feed.syncMore')}</p>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-12">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </button>

                    <span className="text-gray-400 font-medium">
                        Page {currentPage} of {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-6 h-6 text-white" />
                    </button>
                </div>
            )}
        </div>
    );
};
