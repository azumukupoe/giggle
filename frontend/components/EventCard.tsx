"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
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



const formatArtistText = (str: string) => {
    if (!str) return "";
    // Normalize CRLF to LF
    const normalized = str.replace(/\r\n/g, "\n");
    // Split by double newline (paragraph break)
    const paragraphs = normalized.split(/\n\n+/);
    // For each paragraph, replace single newlines with space
    const processedParagraphs = paragraphs.map(p => p.replace(/\n/g, " "));
    // Join paragraphs with a single newline
    return processedParagraphs.join("\n");
};

const TruncatedText = ({
    text,
    tooltipText,
    className,
    as: Component = 'p',
    maxLines = 0
}: {
    text: string,
    tooltipText?: string,
    className?: string,
    as?: any,
    maxLines?: number
}) => {
    const ref = useRef<HTMLElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top?: number, bottom?: number, left: number, maxHeight?: number }>({ left: 0, bottom: 0 });

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

    const handleMouseEnter = () => {
        if (isTruncated && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Calculate horizontal position
            // Max width is 500px + padding/margin safety
            const MAX_WIDTH = 510;
            let left = rect.left;

            // If tooltip would go off right screen, align to right side or shift left
            if (left + MAX_WIDTH > viewportWidth) {
                left = Math.max(16, viewportWidth - MAX_WIDTH - 16);
            }

            // Calculate vertical position and max height
            const spaceAbove = rect.top;
            const spaceBelow = viewportHeight - rect.bottom;
            // minimum space requirement for a useful tooltip
            const MIN_TOOLTIP_HEIGHT = 100;
            const SAFETY_MARGIN = 16; // Margin from screen edge

            let pos: { top?: number; bottom?: number; left: number; maxHeight: number } = {
                left,
                maxHeight: 200 // Default, will be overwritten
            };

            // Heuristic: Prefer above if there is enough space OR if space above is greater than space below
            // But if space above is critically small (< 100) and space below is better, flip.
            // Actually, simplest logic: Go where there is MORE space, unless "Above" has "Enough" space (e.g. > 300px).

            // Let's stick to the previous preference (Above) but be smarter about flipping.
            const preferBelow = spaceAbove < MIN_TOOLTIP_HEIGHT && spaceBelow > spaceAbove;

            if (preferBelow) {
                // Show below
                pos.top = rect.bottom + 8;
                pos.maxHeight = spaceBelow - 8 - SAFETY_MARGIN;
            } else {
                // Show above
                // For "bottom" positioning (css property), the value is distance from bottom of viewport.
                pos.bottom = viewportHeight - rect.top + 8;
                pos.maxHeight = spaceAbove - 8 - SAFETY_MARGIN;
            }

            setTooltipPos(pos);
            setShowTooltip(true);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    return (
        <div
            className="relative flex min-h-0 min-w-0"
            onMouseLeave={handleMouseLeave}
            onMouseEnter={handleMouseEnter}
            onClick={() => isTruncated && setShowTooltip(!showTooltip)}
        >
            <Component
                ref={ref}
                className={`${className} break-words overflow-hidden text-ellipsis ${maxLines > 0 ? '' : 'h-full'}`}
                style={maxLines > 0 ? {
                    display: '-webkit-box',
                    WebkitLineClamp: maxLines,
                    WebkitBoxOrient: 'vertical'
                } : {}}
            >
                {text}
            </Component>

            {showTooltip && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[100] p-2 bg-black/90 text-white text-xs rounded shadow-lg max-w-[min(500px,calc(100vw-32px))] break-words whitespace-pre-wrap overflow-y-auto"
                    style={{
                        ...(tooltipPos.bottom !== undefined ? { bottom: tooltipPos.bottom } : {}),
                        ...(tooltipPos.top !== undefined ? { top: tooltipPos.top } : {}),
                        left: tooltipPos.left,
                        maxHeight: tooltipPos.maxHeight,
                        backdropFilter: 'blur(4px)'
                    }}
                >
                    {tooltipText || text}
                </div>,
                document.body
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
    const dateString = (event.displayDates && event.displayDates.length > 0 ? event.displayDates : [event.date]).map((d) => {
        const hasTime = d.includes('T');
        return format(parseISO(d),
            language === 'ja'
                ? (hasTime ? "yyyy年M月d日(EEE) HH:mm" : "yyyy年M月d日(EEE)")
                : (hasTime ? "EEE, MMM d, yyyy, h:mm a" : "EEE, MMM d, yyyy"),
            { locale: language === 'ja' ? ja : enUS }
        );
    }).join(" / ");

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

    const rawArtist = decodeHtml(event.artist);
    const displayArtist = formatArtistText(rawArtist);

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
                            text={displayArtist}
                            tooltipText={rawArtist}
                            className="text-muted-foreground font-medium text-sm whitespace-pre-wrap"
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
                    <div className="grid grid-cols-2 gap-2">
                        {event.sourceEvents.map((sourceEvent, index) => {
                            const date = parseISO(sourceEvent.date);
                            const month = date.getMonth() + 1;
                            const day = date.getDate();
                            const timeStr = sourceEvent.time ? sourceEvent.time.substring(0, 5) : "";
                            const label = timeStr ? `${month}/${day} ${timeStr}` : `${month}/${day}`;

                            let hostname = "";
                            try {
                                hostname = new URL(sourceEvent.url).hostname;
                            } catch { }

                            return (
                                <a
                                    key={index}
                                    href={sourceEvent.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-secondary text-secondary-foreground font-medium text-xs hover:bg-secondary/80 transition-colors whitespace-nowrap w-full"
                                >
                                    {hostname && (
                                        <img
                                            src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                                            alt={hostname}
                                            className="w-4 h-4 rounded-sm"
                                        />
                                    )}
                                    <span>{label}</span>
                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                </a>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
