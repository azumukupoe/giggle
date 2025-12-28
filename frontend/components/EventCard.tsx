"use client";

import { GroupedEvent } from "@/types/event";
import { parseISO, format } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "./LanguageContext";

// Utility functions extracted outside component to avoid recreation on each render
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

const formatVenue = (ven: string) => {
    return decodeHtml(ven);
};

const getSourceLabel = (url: string | undefined) => {
    try {
        if (!url) return "Event Link";
        const urlObj = new URL(url);
        let hostname = urlObj.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch {
        return "Event Link";
    }
};

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language } = useLanguage();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="group h-[280px] flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
        >
            <div className="p-5 flex flex-col h-full">

                {/* Content: Title & Artist */}
                <div className="flex-grow space-y-1 pt-1">
                    <h3
                        className="text-lg font-bold leading-tight"
                        title={decodeHtml(event.title)}
                    >
                        {decodeHtml(event.title)}
                    </h3>
                    <p
                        className="text-muted-foreground font-medium text-sm truncate"
                        title={decodeHtml(event.artist)}
                    >
                        {decodeHtml(event.artist)}
                    </p>
                </div>

                {/* Footer: Details & CTA */}
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2" title={format(parseISO(event.date), "PPP p", { locale: language === 'ja' ? ja : enUS })}>
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>
                                {format(parseISO(event.date),
                                    language === 'ja' ? "M月d日(EEE) HH:mm" : "EEE, MMM d @ h:mm a",
                                    { locale: language === 'ja' ? ja : enUS }
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span title={`${formatVenue(event.venue)}, ${formatLocation(event.location)}`}>
                                {formatVenue(event.venue)}, {formatLocation(event.location)}
                            </span>
                        </div>
                    </div>

                    {/* Ticket Links - show multiple if grouped */}
                    <div className="flex flex-wrap gap-2">
                        {event.urls.map((url, index) => (
                            <a
                                key={index}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-md bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
                            >
                                {getSourceLabel(url)} <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
