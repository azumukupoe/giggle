"use client";

import { Event } from "@/types/event";
import { parseISO, format } from "date-fns";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

export const EventCard = ({ event }: { event: Event }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-xl transition-all hover:bg-white/10"
        >
            {/* Image Background / Fallback */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-900/50 to-blue-900/50" />

            {event.image_url && (
                <div className="h-48 w-full relative overflow-hidden">
                    <Image
                        src={event.image_url}
                        alt={event.artist}
                        fill
                        className="object-cover transition-transform group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                </div>
            )}

            <div className="p-6 relative z-10 flex flex-col gap-3">
                {/* Source Badge */}
                <span className="self-start px-2 py-1 text-xs font-bold uppercase tracking-wider text-white bg-white/20 rounded-full backdrop-blur-sm">
                    {event.source}
                </span>

                {/* Title & Artist */}
                <div>
                    <h3 className="text-xl font-bold text-white leading-tight line-clamp-2">{event.title}</h3>
                    <p className="text-gray-300 font-medium text-lg line-clamp-1">{event.artist}</p>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-2 text-sm text-gray-400 mt-2">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>{format(parseISO(event.date), "EEE, MMM d, yyyy @ h:mm a")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="line-clamp-1">{event.venue}, {event.location}</span>
                    </div>
                </div>

                {/* CTA */}
                <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:from-purple-500 hover:to-blue-500 transition-colors shadow-lg"
                >
                    View details <ExternalLink className="w-4 h-4" />
                </a>
            </div>
        </motion.div>
    );
};
