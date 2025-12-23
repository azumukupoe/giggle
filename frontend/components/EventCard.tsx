"use client";

import { Event } from "@/types/event";
import { parseISO, format } from "date-fns";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "./LanguageContext";

export const EventCard = ({ event }: { event: Event }) => {
    const { t } = useLanguage();

    const decodeHtml = (str: string) => {
        if (!str) return "";
        return str.replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'");
    };

    const formatLocation = (loc: string) => {
        const decoded = decodeHtml(loc);
        return decoded.replace(/, Japan$/, "").replace(/Japan$/, "").trim();
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="relative group h-[280px] flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-xl transition-all hover:shadow-2xl"
        >
            {/* Image Background (only for dark mode or subtle texture) */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-500/5 to-blue-500/5 dark:from-purple-900/50 dark:to-blue-900/50 opacity-100 dark:opacity-30" />

            <div className="p-5 relative z-10 flex flex-col h-full">
                {/* Header: Source Badge */}
                <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-black/20 dark:bg-white/20 rounded-full backdrop-blur-sm">
                        {event.source}
                    </span>
                </div>

                {/* Content: Title & Artist */}
                <div className="flex-grow">
                    <h3
                        className="text-lg font-bold text-gray-900 dark:text-white leading-tight line-clamp-2 mb-1"
                        title={decodeHtml(event.title)}
                    >
                        {decodeHtml(event.title)}
                    </h3>
                    <p
                        className="text-purple-600 dark:text-purple-400 font-medium text-base line-clamp-1"
                        title={decodeHtml(event.artist)}
                    >
                        {decodeHtml(event.artist)}
                    </p>
                </div>

                {/* Footer: Details & CTA */}
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2" title={format(parseISO(event.date), "PPP p")}>
                            <Calendar className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span>{format(parseISO(event.date), "EEE, MMM d @ h:mm a")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="line-clamp-1" title={formatLocation(event.location)}>
                                {decodeHtml(event.venue)}, {formatLocation(event.location)}
                            </span>
                        </div>
                    </div>

                    <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black font-semibold text-sm hover:opacity-80 transition-opacity"
                    >
                        {t('card.tickets')} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>
            </div>
        </motion.div>
    );
};
