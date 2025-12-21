"use client";

import { useEffect, useState } from "react";
import { EventCard } from "./EventCard";
import { Event } from "@/types/event";
import { supabase } from "@/lib/supabase";
import { useSession } from "next-auth/react";
import { getFollowedArtists } from "@/lib/spotify";

export const Feed = () => {
    const { data: session } = useSession();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMessage, setFilterMessage] = useState("");

    useEffect(() => {
        const fetchEvents = async () => {
            setLoading(true);
            let artistFilter: string[] = [];

            if (session?.accessToken) {
                // 1. Get Followed Artists
                const followed = await getFollowedArtists(session.accessToken as string);
                if (followed.length > 0) {
                    artistFilter = followed;
                    setFilterMessage(`Showing events for your ${followed.length} followed artists.`);

                    // --- NEW: Dynamic Sync (Google for Gigs) ---
                    // Sync these artist names to the public 'artists' table so the backend can scrape them.
                    try {
                        const artistsToInsert = followed.map((name: string) => ({ name }));
                        // Fire and forget, don't block the UI
                        supabase.from('artists').upsert(artistsToInsert, { onConflict: 'name', ignoreDuplicates: true }).then(({ error }) => {
                            if (error) console.error("Error syncing artists to backend:", error);
                        });
                    } catch (err) {
                        console.error("Sync error:", err)
                    }
                    // -------------------------------------------

                } else {
                    setFilterMessage("You don't follow any artists on Spotify yet. Showing all events.");
                }
            } else {
                setFilterMessage("Connect Spotify to see events for your favorite artists.");
            }

            // 2. Query Supabase
            let query = supabase
                .from('events')
                .select('*')
                .order('date', { ascending: true })
                .limit(100);

            if (artistFilter.length > 0) {
                query = query.in('artist', artistFilter);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Error fetching events:", error);
                setEvents([]);
            } else {
                setEvents(data as any as Event[]);
            }
            setLoading(false);
        };

        fetchEvents();
    }, [session]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto">
            {events.length > 0 ? (
                events.map((event) => (
                    <EventCard key={event.id || event.external_id} event={event} />
                ))
            ) : (
                <div className="col-span-full text-center text-gray-500 py-20 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/10">
                    <p className="text-xl">No upcoming concerts found.</p>
                    <p className="text-sm mt-2">Try syncing more artists!</p>
                </div>
            )}
        </div>
    );
};
