"use client";

import { useRef, useState, useEffect } from "react";
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

const formatVenue = (ven: string) => {
    return decodeHtml(ven);
};

const formatLocation = (loc: string) => {
    const decoded = decodeHtml(loc);
    return decoded.replace(/, Japan$/, "").replace(/Japan$/, "").trim();
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

const TruncatedText = ({
    text,
    className,
    as: Component = 'p',
    maxLines = 0
}: {
    text: string,
    className?: string,
    as?: any,
    maxLines?: number
}) => {
    const ref = useRef<HTMLElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        const checkTruncation = () => {
            if (ref.current) {
                const { scrollHeight, clientHeight, scrollWidth, clientWidth } = ref.current;
                setIsTruncated(scrollHeight > clientHeight || scrollWidth > clientWidth);
            }
        };

        checkTruncation();
        // Re-check on window resize
        window.addEventListener('resize', checkTruncation);
        return () => window.removeEventListener('resize', checkTruncation);
    }, [text, maxLines, className, Component]);

    const handleInteraction = (active: boolean) => {
        if (isTruncated) {
            setShowTooltip(active);
        }
    };

    return (
        <div className="relative flex min-h-0 min-w-0" onMouseLeave={() => handleInteraction(false)}>
            <Component
                ref={ref}
                className={`${className} break-words overflow-hidden text-ellipsis ${maxLines > 0 ? '' : 'h-full'}`}
                style={maxLines > 0 ? {
                    display: '-webkit-box',
                    WebkitLineClamp: maxLines,
                    WebkitBoxOrient: 'vertical'
                } : {}}
                onMouseEnter={() => handleInteraction(true)}
                onClick={() => handleInteraction(!showTooltip)}
            >
                {text}
            </Component>

            {showTooltip && (
                <div
                    className="absolute z-50 bottom-full left-0 mb-2 p-2 bg-black/90 text-white text-xs rounded shadow-lg max-w-[250px] break-words pointer-events-none"
                    style={{ backdropFilter: 'blur(4px)' }}
                >
                    {text}
                </div>
            )}
        </div>
    );
};

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language } = useLanguage();
    const [artistMaxLines, setArtistMaxLines] = useState(0);
    const artistContainerRef = useRef<HTMLDivElement>(null);

    const formattedLocation = [formatVenue(event.venue), formatLocation(event.location)]
        .filter(Boolean)
        .join(", ");

    // Format dates into a single string for the tooltip/truncation
    const dateString = (event.displayDates && event.displayDates.length > 0 ? event.displayDates : [event.date]).map((d) => (
        format(parseISO(d),
            language === 'ja' ? "M月d日(EEE) HH:mm" : "EEE, MMM d, h:mm a",
            { locale: language === 'ja' ? ja : enUS }
        )
    )).join(" / ");

    useEffect(() => {
        if (!artistContainerRef.current) return;

        const updateMaxLines = () => {
            if (artistContainerRef.current) {
                const height = artistContainerRef.current.clientHeight;
                // Roughly 20px per line for text-sm (14px * 1.4 line-height ~ 19.6px)
                const lineHeight = 20;
                const lines = Math.max(1, Math.floor(height / lineHeight));
                setArtistMaxLines(lines);
            }
        };

        const observer = new ResizeObserver(updateMaxLines);
        observer.observe(artistContainerRef.current);

        // Initial check
        updateMaxLines();

        return () => observer.disconnect();
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md h-[280px] w-full"
        >
            <div className="p-4 flex flex-col h-full">

                {/* Content: Title & Artist */}
                {/* Flex-grow allows this section to take available space. min-h-0 allows valid truncation inside flex item. */}
                <div className="flex flex-col flex-grow min-h-0 mb-2">
                    <div className="mb-1 shrink-0">
                        <TruncatedText
                            as="h3"
                            text={decodeHtml(event.title)}
                            className="text-lg font-bold leading-tight"
                        // Removed maxLines to never truncate title
                        />
                    </div>

                    {/* Artist/Details takes remaining space */}
                    <div className="flex-1 min-h-0" ref={artistContainerRef}>
                        <TruncatedText
                            text={decodeHtml(event.artist)}
                            className="text-muted-foreground font-medium text-sm"
                            maxLines={artistMaxLines}
                        />
                    </div>
                </div>

                {/* Footer: Details & CTA */}
                <div className="flex flex-col gap-2 shrink-0 border-t pt-2 border-border/50">
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <TruncatedText
                                    text={dateString}
                                    className="block"
                                    maxLines={1}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <TruncatedText
                                    as="span"
                                    text={formattedLocation}
                                    className="line-clamp-1 block"
                                    maxLines={1}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Ticket Links */}
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar md:flex-wrap">
                        {event.urls.map((url, index) => (
                            <a
                                key={index}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-none md:flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-secondary text-secondary-foreground font-medium text-xs hover:bg-secondary/80 transition-colors whitespace-nowrap"
                            >
                                {getSourceLabel(url)} <ExternalLink className="w-3 h-3" />
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
