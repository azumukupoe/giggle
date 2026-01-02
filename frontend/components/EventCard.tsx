"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GroupedEvent } from "@/types/event";
import { parseISO, format, isValid } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "./LanguageContext";

import { localizePrefecture } from "@/lib/prefectures";
import { getStartDate } from "@/lib/eventUtils";

// Utility functions extracted outside component to avoid recreation on each render


const formatVenue = (ven: string) => {
    return ven;
};

const formatLocation = (loc: string, language: string) => {
    const cleaned = loc.replace(/, Japan$/, "").replace(/Japan$/, "").trim();
    return localizePrefecture(cleaned, language);
};





const TooltipPortal = ({ text, pos }: { text: string, pos: { top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number } }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div
            className="fixed z-[100] p-2 bg-black/90 text-white text-xs rounded shadow-lg break-words whitespace-pre-wrap overflow-y-auto"
            style={{
                ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
                ...(pos.top !== undefined ? { top: pos.top } : {}),
                ...(pos.left !== undefined ? { left: pos.left } : {}),
                ...(pos.right !== undefined ? { right: pos.right } : {}),
                maxWidth: pos.maxWidth,
                maxHeight: pos.maxHeight,
                backdropFilter: 'blur(4px)'
            }}
        >
            {text}
        </div>,
        document.body
    );
};

const calculateTooltipPosition = (
    rect: DOMRect | null,
    clientX: number | null,
    clientY: number | null,
    followCursor: boolean
) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const MAX_WIDTH = 500; // Max allowed width if space permits
    const MIN_TOOLTIP_HEIGHT = 100;
    const SAFETY_MARGIN = 16;
    const CURSOR_OFFSET = 16;

    let left: number | undefined;
    let right: number | undefined;
    let maxWidth: number;

    let spaceAbove = 0;
    let spaceBelow = 0;
    let top: number | undefined;
    let bottom: number | undefined;

    // determine horizontal position and width constraint
    if (followCursor && clientX !== null && clientY !== null) {
        // Dynamic anchoring based on side of screen (left half vs right half)
        if (clientX > viewportWidth / 2) {
            // Anchor Right
            right = viewportWidth - clientX + CURSOR_OFFSET;
            // Prevent right from being negative (shouldn't happen with valid mouse), constrain left edge
            // Available width to the left of the cursor
            const availableSpace = clientX - SAFETY_MARGIN;
            maxWidth = Math.min(MAX_WIDTH, availableSpace);
        } else {
            // Anchor Left
            left = clientX + CURSOR_OFFSET;
            // Available width to the right of the cursor
            const availableSpace = viewportWidth - left - SAFETY_MARGIN;
            maxWidth = Math.min(MAX_WIDTH, availableSpace);
        }

        spaceAbove = clientY;
        spaceBelow = viewportHeight - clientY;

        // Prefer below
        if (spaceBelow > MIN_TOOLTIP_HEIGHT || spaceBelow > spaceAbove) {
            top = clientY + CURSOR_OFFSET;
            spaceBelow = spaceBelow - CURSOR_OFFSET - SAFETY_MARGIN;
        } else {
            bottom = viewportHeight - clientY + CURSOR_OFFSET;
            spaceAbove = spaceAbove - CURSOR_OFFSET - SAFETY_MARGIN;
        }
    } else if (rect) {
        // Element-based positioning (fallback or specific use cases)
        // Center-ish logic or similar simply-anchored logic could apply here. 
        // For simplicity reusing left-anchor logic but constrained.

        left = rect.left;
        if (left + MAX_WIDTH > viewportWidth) {
            // If it overflows right, shift it but stay simple for now as primary use case is cursor/touch
            left = Math.max(SAFETY_MARGIN, viewportWidth - MAX_WIDTH - SAFETY_MARGIN);
            maxWidth = Math.min(MAX_WIDTH, viewportWidth - left - SAFETY_MARGIN);
        } else {
            maxWidth = MAX_WIDTH;
        }

        spaceAbove = rect.top;
        spaceBelow = viewportHeight - rect.bottom;

        const preferBelow = spaceAbove < MIN_TOOLTIP_HEIGHT && spaceBelow > spaceAbove;

        if (preferBelow) {
            top = rect.bottom + 8;
            spaceBelow = spaceBelow - 8 - SAFETY_MARGIN;
        } else {
            bottom = viewportHeight - rect.top + 8;
            spaceAbove = spaceAbove - 8 - SAFETY_MARGIN;
        }
    } else {
        // Fallback should ideally not happen
        left = 0;
        maxWidth = 200;
        top = 0;
    }

    return {
        left,
        right,
        top,
        bottom,
        maxWidth,
        maxHeight: top !== undefined ? spaceBelow : spaceAbove
    };
};

const TooltippedLink = ({
    href,
    title,
    children,
    className
}: {
    href: string,
    title?: string,
    children: React.ReactNode,
    className?: string
}) => {
    const ref = useRef<HTMLAnchorElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number }>({});
    const isTouchRef = useRef(false);

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (isTouchRef.current) return;
        if (title) {
            setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
            setShowTooltip(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (showTooltip) {
            setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const handleTouchStart = () => {
        isTouchRef.current = true;
    };

    const handleClick = (e: React.MouseEvent) => {
        // Reset touch flag on click to ensure subsequent interactions are handled correctly if device capabilities change
        // But for this interaction:
        if (isTouchRef.current) {
            if (!showTooltip && title) {
                e.preventDefault();
                setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
                setShowTooltip(true);
            }
            // If tooltip is already shown, allow default (navigation)
        }
    };

    return (
        <>
            <a
                ref={ref}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onClick={handleClick}
            >
                {children}
            </a>
            {showTooltip && title && <TooltipPortal text={title} pos={tooltipPos} />}
        </>
    );
};

const TruncatedText = ({
    text,
    tooltipText,
    className,
    as: Component = 'p',
    maxLines = 0,
    followCursor = true
}: {
    text: string,
    tooltipText?: string,
    className?: string,
    as?: any,
    maxLines?: number,
    followCursor?: boolean
}) => {
    const ref = useRef<HTMLElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number }>({});

    const isTouchRef = useRef(false);

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

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (isTouchRef.current) return;
        if (isTruncated && ref.current) {
            let pos;
            if (followCursor) {
                pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            } else {
                const rect = ref.current.getBoundingClientRect();
                pos = calculateTooltipPosition(rect, null, null, false);
            }
            setTooltipPos(pos);
            setShowTooltip(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (showTooltip && followCursor) {
            const pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            setTooltipPos(pos);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const handleTouchStart = () => {
        isTouchRef.current = true;
    };

    const handleClick = (e: React.MouseEvent) => {
        if (isTruncated) {
            // For touch devices (or if we just want to update position on click)
            // recalculate position based on click coordinates
            const pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            setTooltipPos(pos);
            setShowTooltip(!showTooltip);
        }
    }

    return (
        <div
            className="relative flex min-h-0 min-w-0"
            onMouseLeave={handleMouseLeave}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onClick={handleClick}
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

            {showTooltip && <TooltipPortal text={tooltipText || text} pos={tooltipPos} />}
        </div>
    );
};

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language } = useLanguage();


    const formattedLocation = [formatVenue(event.venue), formatLocation(event.location, language)]
        .filter(Boolean)
        .join(", ");

    // Format dates into a single string for the tooltip/truncation
    const dateString = (event.displayDates && event.displayDates.length > 0 ? event.displayDates : [event.date]).map((d) => {
        const parsed = parseISO(d);
        if (!isValid(parsed)) return d; // Raw string (e.g. range)

        const hasTime = d.includes('T');
        return format(parsed,
            language === 'ja'
                ? (hasTime ? "yyyy年M月d日(EEE) HH:mm" : "yyyy年M月d日(EEE)")
                : (hasTime ? "EEE, MMM d, yyyy, h:mm a" : "EEE, MMM d, yyyy"),
            { locale: language === 'ja' ? ja : enUS }
        );
    }).join(" / ");



    const rawPerformer = event.performer;
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
                        <h3 className="text-lg font-bold leading-tight break-words">
                            {event.event}
                        </h3>
                    </div>

                    {/* Artist/Details takes remaining space */}
                    <div className="flex-1 min-h-0 overflow-y-auto text-muted-foreground font-medium text-sm whitespace-pre-wrap break-words">
                        {rawPerformer}
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
                                    followCursor={true}
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
                            let date = parseISO(sourceEvent.date);
                            if (!isValid(date)) {
                                date = getStartDate(sourceEvent.date);
                            }
                            const month = date.getMonth() + 1;
                            const day = date.getDate();
                            const timeStr = sourceEvent.time ? sourceEvent.time.substring(0, 5) : "";
                            const label = timeStr ? `${month}/${day} ${timeStr}` : `${month}/${day}`;

                            let hostname = "";
                            try {
                                hostname = new URL(sourceEvent.url).hostname;
                            } catch { }

                            return (
                                <TooltippedLink
                                    key={index}
                                    href={sourceEvent.url}
                                    title={sourceEvent.ticket || ""}
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
                                </TooltippedLink>
                            );
                        })}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
