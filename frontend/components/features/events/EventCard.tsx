"use client";

import { useState } from "react";
import { GroupedEvent } from "@/types/event";
import { parseISO, format, isValid, isSameDay } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "../../providers/LanguageContext";
import { getDomain } from "@/utils/eventUtils";
import { prefectures } from "@/utils/prefectures";
import { Modal } from "../../ui/Modal";

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language, t } = useLanguage();
    const [isIdsModalOpen, setIsIdsModalOpen] = useState(false);

    // Helper to process location strings
    const processLocations = (locs: string[]) => {
        return locs
            .filter(Boolean)
            .map(loc => {
                const lower = loc.toLowerCase().trim();

                if (language === 'en') {
                    if (prefectures[lower]) {
                        return lower.charAt(0).toUpperCase() + lower.slice(1);
                    }

                    const entry = Object.entries(prefectures).find(([_, value]) => value === loc);
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
    };

    // Card shows only location
    const cardLocation = processLocations(event.location || []);

    // Modal shows venue + location
    const fullLocation = processLocations([
        ...(event.venue || []),
        ...(event.location || [])
    ]);

    const sortedAllDates = Array.from(new Set([
        ...(event.date || []),
        ...(event.displayDates || [])
    ]))
        .flatMap(d => d.split(/\s+/))
        .filter(d => isValid(parseISO(d)))
        .sort();

    let dateString = "";
    if (sortedAllDates.length > 0) {
        const firstDate = parseISO(sortedAllDates[0]);
        const lastDate = parseISO(sortedAllDates[sortedAllDates.length - 1]);


        if (isValid(firstDate) && isValid(lastDate)) {
            const currentYear = new Date().getFullYear();
            const startYear = firstDate.getFullYear();
            const endYear = lastDate.getFullYear();

            // Modified to use short month (MMM) instead of long month (MMMM)
            const getFormat = (showYear: boolean) =>
                language === 'ja'
                    ? (showYear ? "yyyy年M月d日" : "M月d日")
                    : (showYear ? "MMM d, yyyy" : "MMM d");

            const isSameYear = startYear === endYear;
            const isCurrentYear = startYear === currentYear;

            if (isSameDay(firstDate, lastDate)) {
                dateString = format(firstDate, getFormat(!isCurrentYear), { locale: language === 'ja' ? ja : enUS });
            } else {
                if (isSameYear) {
                    const startFmt = format(firstDate, language === 'ja' ? "M月d日" : "MMM d", { locale: language === 'ja' ? ja : enUS });
                    const endFmt = format(lastDate, getFormat(!isCurrentYear), { locale: language === 'ja' ? ja : enUS });
                    const sep = language === 'ja' ? ' ～ ' : ' - ';
                    dateString = `${startFmt}${sep}${endFmt}`;
                } else {
                    const startFmt = format(firstDate, getFormat(true), { locale: language === 'ja' ? ja : enUS });
                    const endFmt = format(lastDate, getFormat(true), { locale: language === 'ja' ? ja : enUS });
                    const sep = language === 'ja' ? ' ～ ' : ' - ';
                    dateString = `${startFmt}${sep}${endFmt}`;
                }
            }
        }
    }

    const rawPerformer = event.performer;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => setIsIdsModalOpen(true)}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md h-full w-full cursor-pointer hover:border-primary/50"
            >
                <div className="p-4 flex flex-col h-full">
                    <div className="flex flex-col flex-grow min-h-0 mb-2">
                        <div className="mb-1 shrink-0">
                            {/* Removed line-clamp-3 per user request */}
                            <h3 className="text-sm font-bold leading-tight break-words group-hover:text-primary transition-colors">
                                {event.event.join(" ")}
                            </h3>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0 border-t pt-2 border-border/50">
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    {/* Replaced TruncatedText with simple span */}
                                    <span className="block">
                                        {dateString}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    {/* Replaced TruncatedText with simple span and using cardLocation */}
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
                onClose={() => setIsIdsModalOpen(false)}
            >
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex flex-col min-h-0">
                        <div className="shrink-0 flex gap-4 pb-4 mb-4 pt-6 px-6">
                            <div className="flex-1 space-y-2">
                                <h3 className="text-2xl font-bold leading-tight">{event.event.join(" ")}</h3>

                                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-primary shrink-0" />
                                        <span>{dateString}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-primary shrink-0" />
                                        {/* Using fullLocation (venue + location) for Modal */}
                                        <span>{fullLocation}</span>
                                    </div>
                                </div>
                            </div>

                            {event.image && event.image.length > 0 && (
                                <div className="w-32 aspect-square shrink-0 rounded-lg overflow-hidden bg-muted/20 relative">
                                    <img
                                        src={event.image[0]}
                                        alt={event.event[0] || "Event Image"}
                                        className="object-cover w-full h-full"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 px-6">
                            {rawPerformer && rawPerformer.length > 0 && (
                                <div className="bg-muted/30 p-3 rounded-lg max-h-40 overflow-y-auto custom-scrollbar">
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                        {rawPerformer.join(", ")}
                                    </div>
                                </div>
                            )}

                            <div className="pb-6">
                                <div className="flex flex-col gap-3">
                                    {event.sourceEvents.map((ev, i) => {
                                        const sortedDates = [...(ev.date || [])].sort();
                                        let dateLabel = "";

                                        if (sortedDates.length > 0) {
                                            const s = parseISO(sortedDates[0]);
                                            const e = parseISO(sortedDates[sortedDates.length - 1]);

                                            if (isValid(s) && isValid(e)) {
                                                const sYear = s.getFullYear();
                                                const eYear = e.getFullYear();
                                                const curYear = new Date().getFullYear();

                                                const isSameYear = sYear === eYear;
                                                const isCurrentYear = sYear === curYear;

                                                const dateFormat = (d: Date, forceYear: boolean) =>
                                                    format(d, (forceYear || d.getFullYear() !== curYear) ? "M/d/yy" : "M/d");

                                                if (sortedDates.length === 1 || isSameDay(s, e)) {
                                                    dateLabel = dateFormat(s, false);
                                                    if (ev.time && ev.time.length > 0) {
                                                        const timeStr = ev.time[0].substring(0, 5);
                                                        dateLabel += ` ${timeStr}`;
                                                    }
                                                } else {
                                                    const startStr = format(s, !isSameYear || !isCurrentYear ? "M/d/yy" : "M/d");
                                                    const endStr = format(e, !isSameYear || !isCurrentYear ? "M/d/yy" : "M/d");
                                                    const sep = language === 'ja' ? '～' : '-';
                                                    dateLabel = `${startStr}${sep}${endStr}`;
                                                }
                                            }
                                        }

                                        const hostname = getDomain(ev.url);

                                        return (
                                            <a
                                                key={i}
                                                href={ev.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex flex-col gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-all group"
                                            >
                                                <div className="flex items-start gap-3 w-full">
                                                    {hostname && (
                                                        <img
                                                            src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                                                            alt={hostname}
                                                            className="w-5 h-5 rounded-sm shrink-0 mt-0.5"
                                                        />
                                                    )}

                                                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                        <div className="font-semibold text-sm">
                                                            {dateLabel || (t('common.check_site') || "Check Site")}
                                                        </div>

                                                        {ev.ticket && ev.ticket.length > 0 && (
                                                            <div className="flex flex-col gap-0.5">
                                                                {ev.ticket.map((ticketItem, idx) => (
                                                                    <span key={idx} className="text-sm text-muted-foreground/90">
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
                                    })}
                                </div>
                            </div>

                        </div>
                    </div>

                    <div className="flex justify-end p-4 shrink-0 mt-auto">
                        <button
                            onClick={() => setIsIdsModalOpen(false)}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};
