"use client";

import { useState, useMemo, memo, useCallback } from "react";
import Image from "next/image";
import { GroupedEvent, Event } from "@/types/event";
import { parseISO, format, isValid, isSameDay } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar, Ticket } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/components/providers/LanguageContext";
import { getDomain } from "@/utils/eventUtils";
import { prefectures } from "@/utils/prefectures";
import { Modal } from "@/components/ui/Modal";

const EventCardComponent = ({ event }: { event: GroupedEvent }) => {
    const { language } = useLanguage();
    const [isIdsModalOpen, setIsIdsModalOpen] = useState(false);

    // Parse event title
    const mainTitle = event.event[0] || "";

    // Memoized location processing
    const processLocations = useCallback((locs: string[]) => {
        return locs
            .filter(Boolean)
            .map(loc => {
                const lower = loc.toLowerCase().trim();

                if (language === 'en') {
                    if (prefectures[lower]) {
                        return lower.charAt(0).toUpperCase() + lower.slice(1);
                    }

                    const entry = Object.entries(prefectures).find(([, value]) => value === loc);
                    if (entry) {
                        const key = entry[0];
                        return key.charAt(0).toUpperCase() + key.slice(1);
                    }

                    return loc;
                }

                if (prefectures[lower]) return prefectures[lower];

                const stripped = lower.replace(/\s+(prefecture|city)$/, "");
                if (prefectures[stripped]) return prefectures[stripped];
            return loc;
        })
        .join(", ");
    }, [language]);

    // Memoize card location
    const cardLocation = useMemo(() => 
        processLocations(event.location || []),
        [event.location, processLocations]
    );

    // Memoize full location for modal
    const fullLocation = useMemo(() => 
        processLocations([
            ...(event.venue || []),
            ...(event.location || [])
        ]),
        [event.venue, event.location, processLocations]
    );

    // Memoize sorted dates
    const sortedAllDates = useMemo(() => 
        Array.from(new Set([
            ...(event.date || []),
            ...(event.displayDates || [])
        ]))
            .flatMap(d => d.split(/\s+/))
            .filter(d => isValid(parseISO(d)))
            .sort(),
        [event.date, event.displayDates]
    );

    // Memoized date string generation
    const generateDateString = useCallback((short: boolean) => {
        if (sortedAllDates.length === 0) return "";
        const firstDate = parseISO(sortedAllDates[0]);
        const lastDate = parseISO(sortedAllDates[sortedAllDates.length - 1]);

        if (isValid(firstDate) && isValid(lastDate)) {
            const currentYear = new Date().getFullYear();
            const startYear = firstDate.getFullYear();
            const endYear = lastDate.getFullYear();

            const isSameYear = startYear === endYear;
            const isCurrentYear = startYear === currentYear;

            const getFormatString = (hasYear: boolean) => {
                if (language === 'ja') {
                    let fmt = hasYear ? "yyyy年M月d日" : "M月d日";
                    if (!short) fmt += "(EEE)";
                    return fmt;
                } else {
                    const monthFmt = short ? "MMM" : "MMMM";
                    let fmt = hasYear ? `${monthFmt} d, yyyy` : `${monthFmt} d`;
                    if (!short) fmt = `EEEE, ${fmt}`;
                    return fmt;
                }
            };

            if (isSameDay(firstDate, lastDate)) {
                return format(firstDate, getFormatString(!isCurrentYear), { locale: language === 'ja' ? ja : enUS });
            } else {
                const sep = language === 'ja' ? ' ～ ' : ' - ';
                if (isSameYear) {
                    const startStr = format(firstDate, getFormatString(false), { locale: language === 'ja' ? ja : enUS });
                    const endStr = format(lastDate, getFormatString(!isCurrentYear), { locale: language === 'ja' ? ja : enUS });
                    return `${startStr}${sep}${endStr}`;
                } else {
                    const startStr = format(firstDate, getFormatString(true), { locale: language === 'ja' ? ja : enUS });
                    const endStr = format(lastDate, getFormatString(true), { locale: language === 'ja' ? ja : enUS });
                    return `${startStr}${sep}${endStr}`;
                }
            }
        }
        return "";
    }, [sortedAllDates, language]);

    // Memoize date strings
    const cardDateString = useMemo(() => generateDateString(true), [generateDateString]);
    const modalDateString = useMemo(() => generateDateString(false), [generateDateString]);

    // Memoized ticket date label generator
    const getTicketDateLabel = useCallback((ev: Event) => {
        const sortedDates = [...(ev.date || [])].sort();
        if (sortedDates.length === 0) return "";

        const s = parseISO(sortedDates[0]);
        const e = parseISO(sortedDates[sortedDates.length - 1]);

        if (!isValid(s) || !isValid(e)) return "";

        const curYear = new Date().getFullYear();
        const sYear = s.getFullYear();
        const eYear = e.getFullYear();
        const isSameYear = sYear === eYear;
        const isCurrentYear = sYear === curYear;

        const dateFormat = (d: Date) =>
            format(d, !isCurrentYear ? "M/d/yy" : "M/d", { locale: language === 'ja' ? ja : enUS });

        let dateLabel = "";
        if (sortedDates.length === 1 || isSameDay(s, e)) {
            dateLabel = dateFormat(s);
            if (ev.time && ev.time.length > 0) {
                const timeStr = ev.time[0].substring(0, 5);
                dateLabel += ` ${timeStr}`;
            }
        } else {
            const startStr = format(s, !isSameYear || !isCurrentYear ? "M/d/yy" : "M/d", { locale: language === 'ja' ? ja : enUS });
            const endStr = format(e, !isSameYear || !isCurrentYear ? "M/d/yy" : "M/d", { locale: language === 'ja' ? ja : enUS });
            const sep = language === 'ja' ? '～' : '-';
            dateLabel = `${startStr}${sep}${endStr}`;
        }
        return dateLabel;
    }, [language]);

    // Memoize grouped events for modal
    const { groupedByPerformer, noPerformerEvents } = useMemo(() => {
        const grouped: Record<string, Event[]> = {};
        const noPerformer: Event[] = [];

        event.sourceEvents.forEach(ev => {
            const p = ev.performer;
            if (p && p.length > 0) {
                const key = [...p].sort().join(", ");
                if (!grouped[key]) {
                    grouped[key] = [];
                }
                grouped[key].push(ev);
            } else {
                noPerformer.push(ev);
            }
        });

        return { groupedByPerformer: grouped, noPerformerEvents: noPerformer };
    }, [event.sourceEvents]);

    const handleOpenModal = useCallback(() => setIsIdsModalOpen(true), []);
    const handleCloseModal = useCallback(() => setIsIdsModalOpen(false), []);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                onClick={handleOpenModal}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenModal()}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md h-full w-full cursor-pointer hover:border-primary/50"
            >
                <div className="p-4 flex flex-col h-full">
                    <div className="flex flex-col flex-grow min-h-0 mb-2">
                        <div className="mb-1 shrink-0">
                            <h3 className="text-sm font-bold leading-tight break-words group-hover:text-primary transition-colors">
                                {mainTitle}
                            </h3>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0 border-t pt-2 border-border/50">
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <span className="block">
                                        {cardDateString}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <span className="block">
                                        {cardLocation}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <Modal
                isOpen={isIdsModalOpen}
                onClose={handleCloseModal}
            >
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Header - Fixed */}
                    <div className="shrink-0 flex gap-4 pb-4 mb-2 pt-6 px-6 border-b border-border/40">
                        <div className="flex-1 space-y-2">
                            <h3 className="text-2xl font-bold leading-tight">{mainTitle}</h3>

                            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-primary shrink-0" />
                                    <span>{modalDateString}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                                    <span>{fullLocation}</span>
                                </div>
                            </div>
                        </div>

                        {event.image && event.image.length > 0 && (
                            <div className="w-32 aspect-square shrink-0 rounded-lg overflow-hidden bg-muted/20 relative">
                                <Image
                                    src={event.image[0]}
                                    alt={mainTitle}
                                    fill
                                    sizes="128px"
                                    className="object-cover"
                                    unoptimized
                                />
                            </div>
                        )}
                    </div>

                    {/* Tickets Section - Independently Scrollable */}
                    <div className="flex-1 min-h-[30%] overflow-y-auto custom-scrollbar pb-2">
                        {/* Render grouped events */}
                        {Object.entries(groupedByPerformer).map(([performerList, events], idx) => (
                            <div key={idx} className="mb-6 last:mb-0">
                                <h4 className="text-sm font-semibold mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10 border-b border-border/50 text-foreground/80 leading-relaxed whitespace-pre-wrap">
                                    {performerList}
                                </h4>
                                <div className="flex flex-col gap-2">
                                    {events.map((ev, i) => (
                                        <TicketButton key={`${idx}-${i}`} ev={ev} getDomain={getDomain} getTicketDateLabel={getTicketDateLabel} />
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Render events with no performer info */}
                        {noPerformerEvents.length > 0 && (
                            <div className="mb-4">
                                <div className="flex flex-col gap-2">
                                    {noPerformerEvents.map((ev, i) => (
                                        <TicketButton key={`noperf-${i}`} ev={ev} getDomain={getDomain} getTicketDateLabel={getTicketDateLabel} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>


            </Modal>
        </>
    );
};

// Export memoized component to prevent unnecessary re-renders
export const EventCard = memo(EventCardComponent);
EventCard.displayName = "EventCard";

interface TicketButtonProps {
    ev: Event;
    getDomain: (url: string) => string | null;
    getTicketDateLabel: (ev: Event) => string;
}

const TicketButton = memo(function TicketButton({ ev, getDomain, getTicketDateLabel }: TicketButtonProps) {
    const hostname = getDomain(ev.url);
    const dateLabel = getTicketDateLabel(ev);

    return (
        <a
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-all group border border-transparent hover:border-border/50"
        >
            <div className="flex items-start gap-3 w-full">
                {hostname && (
                    <Image
                        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                        alt={hostname}
                        width={20}
                        height={20}
                        className="rounded-sm shrink-0 mt-0.5"
                        unoptimized
                    />
                )}

                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                        {dateLabel || "Check Site"}
                    </div>

                    {ev.ticket && ev.ticket.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            {ev.ticket.map((ticketItem, idx) => (
                                <span key={idx} className="text-sm text-muted-foreground/90 flex items-center gap-1.5">
                                    <Ticket className="w-3 h-3 shrink-0 opacity-70" />
                                    {ticketItem}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
            </div>
        </a>
    );
});

