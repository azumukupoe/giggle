"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ja';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, args?: Record<string, string | number>) => string;
}

const translations = {
    en: {
        "feed.searchPlaceholder": "Search by event, artist, venue, location, or date...",
        "feed.noEvents": "No upcoming concerts found.",
        "feed.eventsFound": "{count} events found",
        "feed.loading": "Loading events...",
        "theme.light": "Light",
        "theme.dark": "Dark",
        "theme.system": "System",
        "search.filterBy": "Filter by:",
        "search.event": "Event",
        "search.performer": "Performer",
        "search.venue": "Venue",
        "search.location": "Location",
        "search.date": "Date",
        "feed.showingEvents": "Showing {start}-{end} of {total} events",
        "eventCard.more": "+{count} More",
        "common.close": "Close",
    },
    ja: {
        "feed.searchPlaceholder": "イベント、出演者、会場、場所、または日程で検索...",
        "feed.noEvents": "予定されているコンサートは見つかりませんでした。",
        "feed.eventsFound": "{count} 件のイベント",
        "feed.loading": "読み込み中...",
        "theme.light": "ライト",
        "theme.dark": "ダーク",
        "theme.system": "システム",
        "search.filterBy": "フィルター:",
        "search.event": "イベント",
        "search.performer": "出演者",
        "search.venue": "会場",
        "search.location": "場所",
        "search.date": "日程",
        "feed.showingEvents": "{total} 件中 {start}-{end} 件を表示",
        "eventCard.more": "他 {count} 件",
        "common.close": "閉じる",
    }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
    const [language, setLanguage] = useState<Language>('en');

    useEffect(() => {
        // Create a simplified version of locale detection
        const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
        // eslint-disable-next-line
        setLanguage(browserLang);
    }, []);

    const t = (key: string, args?: Record<string, string | number>): string => {
        // @ts-expect-error - key access on loose dict implies any
        let text = translations[language][key] || key;

        if (args) {
            Object.entries(args).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }

        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};


export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
};
