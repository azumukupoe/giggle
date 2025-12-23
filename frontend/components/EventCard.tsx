"use client";

import { Event } from "@/types/event";
import { parseISO, format } from "date-fns";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "./LanguageContext";

export const EventCard = ({ event }: { event: Event }) => {
    const { t, translateLocation } = useLanguage();

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
        const cleaned = decoded.replace(/, Japan$/, "").replace(/Japan$/, "").trim();
        return translateLocation(cleaned);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="group h-[280px] flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
        >
            <div className="p-5 flex flex-col h-full">
                {/* Header: Source Badge */}
                <div className="flex justify-between items-start mb-3">
                    <span className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary rounded-full">
                        {event.source}
                    </span>
                </div>

                {/* Content: Title & Artist */}
                <div className="flex-grow space-y-1">
                    <h3
                        className="text-lg font-bold leading-tight line-clamp-2"
                        title={decodeHtml(event.title)}
                    >
                        {decodeHtml(event.title)}
                    </h3>
                    <p
                        className="text-muted-foreground font-medium text-sm line-clamp-1"
                        title={decodeHtml(event.artist)}
                    >
                        {decodeHtml(event.artist)}
                    </p>
                </div>

                {/* Footer: Details & CTA */}
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2" title={format(parseISO(event.date), "PPP p")}>
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>{format(parseISO(event.date), "EEE, MMM d @ h:mm a")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="line-clamp-1" title={formatLocation(event.location)}>
                                {decodeHtml(event.venue)}, {formatLocation(event.location)}
                            </span>
                        </div>
                    </div>

                    <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-md bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
                    >
                        {t('card.tickets')} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>
            </div>
        </motion.div>
    );
};
