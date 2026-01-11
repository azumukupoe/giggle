"use client";

import { useState } from "react";
import { GroupedEvent, Event } from "@/types/event";
import { parseISO, format, isValid, isSameDay } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import { ExternalLink, MapPin, Calendar, Ticket } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "../../providers/LanguageContext";
import { getDomain } from "@/utils/eventUtils";
import { prefectures } from "@/utils/prefectures";
import { Modal } from "../../ui/Modal";

export const EventCard = ({ event }: { event: GroupedEvent }) => {
    const { language, t } = useLanguage();
    const [isIdsModalOpen, setIsIdsModalOpen] = useState(false);

    // Parse event title
    const mainTitle = event.event[0] || "";
    // Subtitle is used for grouping, but can also be the default if needed

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

    const generateDateString = (short: boolean) => {
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
    };

    const cardDateString = generateDateString(true);
    const modalDateString = generateDateString(false);

    const rawPerformer = event.performer;

    // Group source events by subtitle (index 1 of their event array)
    const groupedSourceEvents: Record<string, Event[]> = {};
    const noSubtitleEvents: Event[] = [];

    event.sourceEvents.forEach(ev => {
        const sub = ev.event && ev.event.length > 1 ? ev.event[1] : null;
        if (sub) {
            if (!groupedSourceEvents[sub]) {
                groupedSourceEvents[sub] = [];
            }
            groupedSourceEvents[sub].push(ev);
        } else {
            noSubtitleEvents.push(ev);
        }
    });

    // Helper to format date display for ticket buttons
    const getTicketDateLabel = (ev: Event) => {
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
    };

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
                onClose={() => setIsIdsModalOpen(false)}
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
                                <img
                                    src={event.image[0]}
                                    alt={mainTitle}
                                    className="object-cover w-full h-full"
                                />
                            </div>
                        )}
                    </div>

                    {/* Split Content Area */}
                    <div className="flex-1 flex flex-col min-h-0 px-6 gap-4 pb-0">

                        {/* Performers Section - Independently Scrollable */}
                        {(() => {
                            // 1. Group performers by unique time slots
                            const performerGroups: { date: Date; timeStr: string; performers: string[] }[] = [];
                            const seenSlots = new Set<string>();

                            event.sourceEvents.forEach(ev => {
                                const p = ev.performer;
                                if (!p || p.length === 0) return;

                                const dStr = ev.date?.[0];
                                const tStr = ev.time?.[0];

                                if (!dStr) return;

                                // Create a unique key for this slot
                                const slotKey = `${dStr}_${tStr || 'NO_TIME'}`;

                                if (!seenSlots.has(slotKey)) {
                                    seenSlots.add(slotKey);

                                    // Combine date and time for sorting
                                    let dateObj = parseISO(dStr);
                                    if (tStr) {
                                        // Try to parse combined string if possible, or just add time to date object
                                        // Simplest: use string comparison for same-date sorting or just assume sourceEvents might be sorted? 
                                        // Better: Parse properly. 
                                        // If tStr is "13:30:00+09", we can append it to date string "2026-01-12" -> "2026-01-12T13:30:00+09"
                                        try {
                                            const combined = parseISO(`${dStr}T${tStr}`);
                                            if (isValid(combined)) dateObj = combined;
                                        } catch (e) { }
                                    }

                                    performerGroups.push({
                                        date: dateObj,
                                        timeStr: tStr || "",
                                        performers: p
                                    });
                                }
                            });

                            // 2. Sort chronologically
                            performerGroups.sort((a, b) => a.date.getTime() - b.date.getTime());

                            // 3. Check if we need split display
                            // If any group has a different performer set than the first group
                            let hasDiff = false;
                            if (performerGroups.length > 1) {
                                const firstSig = JSON.stringify([...performerGroups[0].performers].sort());
                                hasDiff = performerGroups.some(g => JSON.stringify([...g.performers].sort()) !== firstSig);
                            }

                            if (hasDiff) {
                                return (
                                    <div className="flex-1 min-h-[20%] overflow-y-auto custom-scrollbar border-b border-border/40 pb-4">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t('event.performers') || "Performers"}</h4>
                                        <div className="flex flex-col gap-3">
                                            {performerGroups.map((group, idx) => {
                                                const prevGroup = idx > 0 ? performerGroups[idx - 1] : null;
                                                const showDate = !prevGroup || !isSameDay(group.date, prevGroup.date);

                                                // Format: "13:30" or "Feb 12 13:30"
                                                let headerText = "";
                                                const timeDisplay = group.timeStr ? group.timeStr.substring(0, 5) : ""; // simplistic HH:MM extraction

                                                if (showDate) {
                                                    const dateFmt = language === 'ja' ? "M月d日" : "MMM d";
                                                    const dateStr = format(group.date, dateFmt, { locale: language === 'ja' ? ja : enUS });
                                                    headerText = `${dateStr}`;
                                                }

                                                if (timeDisplay) {
                                                    headerText = headerText ? `${headerText} ${timeDisplay}` : timeDisplay;
                                                }
                                                // If exact matching was merged, we wouldn't satisfy hasDiff unless performers differed for SAME slot (which shouldn't happen by logic above unless we merge slots differently)
                                                // User req: "if date differ it should be displayed beside time" -> Checked above

                                                return (
                                                    <div key={idx} className="bg-muted/30 p-3 rounded-lg">
                                                        {(headerText) && (
                                                            <div className="text-xs font-bold text-primary mb-1.5 opacity-90">
                                                                {headerText}
                                                            </div>
                                                        )}
                                                        <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                                            {group.performers.join(", ")}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            } else {
                                // Default display
                                return rawPerformer && rawPerformer.length > 0 && (
                                    <div className="flex-1 min-h-[20%] overflow-y-auto custom-scrollbar border-b border-border/40 pb-4">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t('event.performers') || "Performers"}</h4>
                                        <div className="bg-muted/30 p-3 rounded-lg">
                                            <div className="whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                                {rawPerformer.join(", ")}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                        })()}

                        {/* Tickets Section - Independently Scrollable */}
                        <div className="flex-1 min-h-[30%] overflow-y-auto custom-scrollbar pb-2">

                            {/* Render grouped events */}
                            {Object.entries(groupedSourceEvents).map(([subtitle, events], idx) => (
                                <div key={idx} className="mb-6 last:mb-0">
                                    <h4 className="text-sm font-semibold mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10 border-b border-border/50 text-foreground/80">
                                        {subtitle}
                                    </h4>
                                    <div className="flex flex-col gap-2">
                                        {events.map((ev, i) => (
                                            <TicketButton key={`${idx}-${i}`} ev={ev} language={language} getDomain={getDomain} getTicketDateLabel={getTicketDateLabel} />
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* Render events with no subtitle */}
                            {noSubtitleEvents.length > 0 && (
                                <div className="mb-4">
                                    {(Object.keys(groupedSourceEvents).length > 0) && (
                                        <h4 className="text-sm font-semibold mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10 border-b border-border/50 text-foreground/80">
                                            {t('event.others') || "Others"}
                                        </h4>
                                    )}
                                    <div className="flex flex-col gap-2">
                                        {noSubtitleEvents.map((ev, i) => (
                                            <TicketButton key={`nosec-${i}`} ev={ev} language={language} getDomain={getDomain} getTicketDateLabel={getTicketDateLabel} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer - Fixed */}
                    <div className="flex justify-end p-4 shrink-0 mt-auto border-t border-border/40">
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

const TicketButton = ({ ev, language, getDomain, getTicketDateLabel }: { ev: Event, language: string, getDomain: (url: string) => string | null, getTicketDateLabel: (ev: Event) => string }) => {
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
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                        alt={hostname}
                        className="w-5 h-5 rounded-sm shrink-0 mt-0.5"
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
};
