"use client";

import { useState } from "react";
import { GroupedEvent } from "@/types/event";
import { parseISO, format, isValid } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "../../providers/LanguageContext";
import { getStartDate, getDomain, normalizeEventName, cleanEventName } from "@/utils/eventUtils";
import { prefectures } from "@/utils/prefectures";
import { Modal } from "../../ui/Modal";
import { TooltippedLink } from "../../ui/TooltippedLink";
import { TruncatedText } from "../../ui/TruncatedText";

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language, t } = useLanguage();
    const [isIdsModalOpen, setIsIdsModalOpen] = useState(false);

    const formattedLocation = [
        ...(event.venue || []),
        ...(event.location || [])
    ]
        .filter(Boolean)
        .map(loc => {
            const lower = loc.toLowerCase().trim();

            // Handle English localization preference
            if (language === 'en') {
                // Check if it's a known prefecture key (e.g. "tokyo")
                if (prefectures[lower]) {
                    // Capitalize first letter
                    return lower.charAt(0).toUpperCase() + lower.slice(1);
                }

                // Try to find key by value (Japanese -> English)
                const entry = Object.entries(prefectures).find(([_, value]) => value === loc);
                if (entry) {
                    const key = entry[0];
                    return key.charAt(0).toUpperCase() + key.slice(1);
                }

                return loc;
            }

            // Japanese logic
            // Try explicit match first
            if (prefectures[lower]) return prefectures[lower];
            // Try stripping common suffixes for match
            const stripped = lower.replace(/\s+(prefecture|city)$/, "");
            if (prefectures[stripped]) return prefectures[stripped];
            return loc;
        })
        .join(", ");

    // Format dates into a single string for the tooltip/truncation
    const dateString = (event.displayDates && event.displayDates.length > 0 ? event.displayDates : event.date).map((d) => {
        // Handle space-separated range (e.g. "2026-07-25 2026-08-23")
        const dateParts = d.split(' ');

        // If it's a range (start end), format nicely
        if (dateParts.length >= 2) {
            const startParsed = parseISO(dateParts[0]);
            const endParsed = parseISO(dateParts[dateParts.length - 1]);
            if (isValid(startParsed) && isValid(endParsed)) {
                const startFmt = format(startParsed, language === 'ja' ? "M月d日" : "MMM d", { locale: language === 'ja' ? ja : enUS });
                const endFmt = format(endParsed, language === 'ja' ? "M月d日" : "MMM d", { locale: language === 'ja' ? ja : enUS });
                const sep = language === 'ja' ? ' ～ ' : ' - ';
                return `${startFmt}${sep}${endFmt}`;
            }
        }

        const formattedParts = dateParts.map(part => {
            const parsed = parseISO(part);
            if (!isValid(parsed)) return part;

            const hasTime = part.includes('T');
            return format(parsed,
                language === 'ja'
                    ? (hasTime ? "M月d日(EEE) HH:mm" : "M月d日(EEE)")
                    : (hasTime ? "EEE, MMM d, h:mm a" : "EEE, MMM d"),
                { locale: language === 'ja' ? ja : enUS }
            );
        });

        const separator = language === 'ja' ? " ～ " : " - ";
        return formattedParts.join(separator);
    }).join(" / ");

    const rawPerformer = event.performer;

    // --- Ticket Button Logic ---
    // (Rendered directly in modal)

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => setIsIdsModalOpen(true)}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md h-[180px] w-full cursor-pointer hover:border-primary/50"
            >
                <div className="p-4 flex flex-col h-full">

                    {/* Content: Title */}
                    <div className="flex flex-col flex-grow min-h-0 mb-2">
                        <div className="mb-1 shrink-0">
                            <h3 className="text-sm font-bold leading-tight line-clamp-3 break-words group-hover:text-primary transition-colors">
                                {event.event.join(" ")}
                            </h3>
                        </div>
                    </div>

                    {/* Footer: Details */}
                    <div className="flex flex-col gap-1.5 shrink-0 border-t pt-2 border-border/50">
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
                    </div>
                </div>
            </motion.div>

            {/* Full List Modal */}
            <Modal
                isOpen={isIdsModalOpen}
                onClose={() => setIsIdsModalOpen(false)}
            >
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex flex-col min-h-0">
                        {/* Header with Image on Right */}
                        <div className="shrink-0 flex gap-4 border-b pb-4 mb-4 pt-6 px-6">
                            <div className="flex-1 space-y-4">
                                <h3 className="text-2xl font-bold leading-tight">{event.event.join(" ")}</h3>

                                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-primary shrink-0" />
                                        <span>{formattedLocation}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Image Section */}
                            {event.image && event.image.length > 0 && (
                                <div className="w-32 h-24 shrink-0 rounded-lg overflow-hidden bg-muted/20 relative">
                                    <img
                                        src={event.image[0]}
                                        alt={event.event[0] || "Event Image"}
                                        className="object-cover w-full h-full"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 px-6">

                            {/* Performers Section - Hidden if empty */}
                            {rawPerformer && rawPerformer.length > 0 && (
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                        {rawPerformer.join(", ")}
                                    </div>
                                </div>
                            )}

                            {/* Ticket Links Section */}
                            <div className="pb-6">
                                <div className="flex flex-col gap-3">
                                    {event.sourceEvents.map((ev, i) => {
                                        // Date Logic
                                        const sortedDates = [...(ev.date || [])].sort();
                                        let dateLabel = "";
                                        const timeSeparator = language === 'ja' ? '～' : '-';

                                        if (sortedDates.length >= 2) {
                                            const s = parseISO(sortedDates[0]);
                                            const e = parseISO(sortedDates[sortedDates.length - 1]);
                                            if (isValid(s) && isValid(e)) {
                                                const sFmt = format(s, language === 'ja' ? "yyyy/M/d" : "MMM d, yyyy", { locale: language === 'ja' ? ja : enUS });
                                                const eFmt = format(e, language === 'ja' ? "M/d" : "MMM d", { locale: language === 'ja' ? ja : enUS });
                                                const sep = language === 'ja' ? ' ～ ' : ' - ';
                                                dateLabel = `${sFmt}${sep}${eFmt}`;
                                            }
                                        } else if (sortedDates.length === 1) {
                                            const d = parseISO(sortedDates[0]);
                                            if (isValid(d)) {
                                                // Usage: Full date dateLabel += Time
                                                dateLabel = format(d, language === 'ja' ? "yyyy/M/d(EEE)" : "EEE, MMM d, yyyy", { locale: language === 'ja' ? ja : enUS });
                                                if (ev.time && ev.time.length > 0) {
                                                    let timeStr = ev.time[0].substring(0, 5);
                                                    if (ev.time.length > 1) {
                                                        timeStr += `${timeSeparator}${ev.time[1].substring(0, 5)}`;
                                                    }
                                                    dateLabel += ` ${timeStr}`;
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
                                                        {/* Date and Time */}
                                                        <div className="font-semibold text-sm">
                                                            {dateLabel || (t('common.check_site') || "Check Site")}
                                                        </div>

                                                        {/* Ticket List - New Lines */}
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

                    <div className="flex justify-end p-4 shrink-0 border-t mt-auto">
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
