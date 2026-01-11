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
    const MAX_VISIBLE_BUTTONS = 6;
    const totalButtons = event.sourceEvents.length;
    const hasMoreButtons = totalButtons > MAX_VISIBLE_BUTTONS;

    // Keep active buttons: all if <= MAX, else MAX-1 + "More"
    const visibleEvents = hasMoreButtons
        ? event.sourceEvents.slice(0, MAX_VISIBLE_BUTTONS - 1)
        : event.sourceEvents;

    const renderTicketButton = (sourceEvent: typeof event.sourceEvents[0], index: number) => {
        const sortedDates = [...(sourceEvent.date || [])].sort();
        let label: string;

        if (sortedDates.length >= 2) {
            // Date range: show start and end dates
            const startDate = parseISO(sortedDates[0]);
            const endDate = parseISO(sortedDates[sortedDates.length - 1]);
            const startLabel = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
            const endLabel = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
            const separator = language === 'ja' ? ' ～ ' : ' - ';
            label = `${startLabel}${separator}${endLabel}`;
        } else if (sortedDates.length === 1) {
            // Single date
            let date = parseISO(sortedDates[0]);
            if (!isValid(date)) {
                date = getStartDate(sourceEvent.date);
            }
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const timeSeparator = language === 'ja' ? '～' : '-';
            let timeStr = "";
            if (sourceEvent.time && sourceEvent.time.length > 0) {
                timeStr = sourceEvent.time[0].substring(0, 5);
                if (sourceEvent.time.length > 1) {
                    timeStr += `${timeSeparator}${sourceEvent.time[1].substring(0, 5)}`;
                }
            }
            label = timeStr ? `${month}/${day} ${timeStr}` : `${month}/${day}`;
        } else {
            label = t('common.check_site') || "Check Site";
        }

        const hostname = getDomain(sourceEvent.url);

        // Calculate diff between specific event name and grouped common name
        const commonName = event.event.join(" ");
        const specificName = (sourceEvent.event || []).join(" ");
        let diff = "";

        const specificDisplay = cleanEventName(specificName);

        if (specificName && commonName && normalizeEventName(specificDisplay) !== normalizeEventName(commonName)) {
            // Default subtraction
            let text = specificDisplay.replace(commonName, "").trim();

            // Special handling for || separated events (Artist || Title)
            if (specificName.includes("||")) {
                const parts = specificName.split(/\s*\|\|\s*/);
                if (parts.length > 1) {
                    const prefix = parts[0].trim();
                    const suffix = parts.slice(1).join(" ").trim();

                    // Case 1: Prefix is covered by Common Name -> Show Suffix
                    if (normalizeEventName(commonName).includes(normalizeEventName(prefix))) {
                        text = suffix;
                    }
                }
            }

            // Also handle case where Specific is a substring of Common (redundant)
            if (text === specificDisplay && normalizeEventName(commonName).includes(normalizeEventName(specificDisplay))) {
                text = "";
            }

            diff = text;

            if (diff.startsWith("||")) {
                diff = diff.substring(2).trim();
            }
        }

        const ticketInfo = (sourceEvent.ticket || []).join(", ");

        // Prevent duplicate text in tooltip
        // If the diff (e.g. "<通し券>") is already contained in ticket info (e.g. "<通し券>一般発売"),
        // just show the ticket info.
        let tooltipParts = [diff, ticketInfo].filter(Boolean);
        if (diff && ticketInfo && ticketInfo.includes(diff)) {
            tooltipParts = [ticketInfo];
        }

        const tooltip = tooltipParts.join(" / ");

        return (
            <TooltippedLink
                key={`${sourceEvent.id || index}`}
                href={sourceEvent.url}
                title={tooltip}
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
    };

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
                <div className="flex flex-col h-full max-h-[85vh]">
                    <div className="shrink-0 space-y-4 border-b pb-4 mb-4">
                        <h3 className="text-2xl font-bold leading-tight">{event.event.join(" ")}</h3>

                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-primary shrink-0" />
                                <span>{formattedLocation}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 space-y-6">

                        {/* Image Section */}
                        {event.image && event.image.length > 0 && (
                            <div className="w-full aspect-video relative rounded-lg overflow-hidden bg-muted/20">
                                <img
                                    src={event.image[0]}
                                    alt={event.event[0] || "Event Image"}
                                    className="object-contain w-full h-full"
                                />
                            </div>
                        )}

                        {/* Performers Section */}
                        {rawPerformer && (
                            <div className="bg-muted/30 p-3 rounded-lg">
                                {/* Hidden title <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wider">{t('eventCard.performers') || "Performers"}</h4> */}
                                <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                    {rawPerformer.join(", ")}
                                </div>
                            </div>
                        )}

                        {/* Ticket Links Section */}
                        <div>
                            {/* Hidden title <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-4 tracking-wider">{t('eventCard.tickets') || "Tickets"}</h4> */}
                            <div className="flex flex-col gap-4">
                                {event.sourceEvents.map((ev, i) => {
                                    // Calculate date label for this specific ticket
                                    const sortedDates = [...(ev.date || [])].sort();
                                    let dateLabel = "";

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
                                            dateLabel = format(d, language === 'ja' ? "yyyy/M/d(EEE)" : "EEE, MMM d, yyyy", { locale: language === 'ja' ? ja : enUS });
                                            if (ev.time && ev.time.length > 0) {
                                                dateLabel += ` ${ev.time[0].substring(0, 5)}`;
                                            }
                                        }
                                    }

                                    // Render button logic inline or reused? Reusing refined logic below
                                    const ticketLabel = (ev.ticket || []).join(" / ") || (t('common.check_site') || "Check Site");
                                    const hostname = getDomain(ev.url);

                                    return (
                                        <div key={i} className="flex flex-col gap-1.5 border-b last:border-0 pb-3 last:pb-0">
                                            {dateLabel && (
                                                <span className="text-xs font-mono text-muted-foreground ml-1">
                                                    {dateLabel}
                                                </span>
                                            )}
                                            <a
                                                href={ev.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-all group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {hostname && (
                                                        <img
                                                            src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                                                            alt={hostname}
                                                            className="w-5 h-5 rounded-sm shrink-0"
                                                        />
                                                    )}
                                                    <span className="font-medium text-sm truncate">{ticketLabel}</span>
                                                </div>
                                                <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 shrink-0 mt-auto">
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
