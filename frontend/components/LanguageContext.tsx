"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ja';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    translateLocation: (loc: string) => string;
}

const translations = {
    en: {
        "nav.connect": "Connect Spotify",
        "nav.logout": "Logout",
        "feed.title": "Your Concert Feed",
        "feed.subtitle": "Upcoming shows for artists you follow.",
        "feed.searchPlaceholder": "Search by artist, venue, or city...",
        "feed.noEvents": "No upcoming concerts found.",
        "feed.loading": "Loading events...",
        "card.date": "Date",
        "card.venue": "Venue",
        "card.location": "Location",
        "card.tickets": "Get Tickets",
        "card.source": "Source",
    },
    ja: {
        "nav.connect": "Spotifyと連携",
        "nav.logout": "ログアウト",
        "feed.title": "コンサートフィード",
        "feed.subtitle": "フォロー中のアーティストの公演情報",
        "feed.searchPlaceholder": "アーティスト、会場、都市で検索...",
        "feed.noEvents": "予定されているコンサートは見つかりませんでした。",
        "feed.loading": "読み込み中...",
        "card.date": "日付",
        "card.venue": "会場",
        "card.location": "場所",
        "card.tickets": "チケットを見る",
        "card.source": "情報元",
    }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
    const [language, setLanguage] = useState<Language>('en');

    useEffect(() => {
        // Create a simplified version of locale detection
        const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
        setLanguage(browserLang);
    }, []);

    const t = (key: string): string => {
        // @ts-ignore
        return translations[language][key] || key;
    };

    const cityTranslations: Record<string, string> = {
        "Tokyo": "東京",
        "Osaka": "大阪",
        "Kyoto": "京都",
        "Nagoya": "名古屋",
        "Fukuoka": "福岡",
        "Sapporo": "札幌",
        "Yokohama": "横浜",
        "Kobe": "神戸",
        "Saitama": "埼玉",
        "Chiba": "千葉",
        "Hiroshima": "広島",
        "Sendai": "仙台",
        "Okinawa": "沖縄",
    };

    const translateLocation = (loc: string): string => {
        if (language !== 'ja') return loc;
        // Simple exact match or contains check could be used. 
        // For now, let's try to find a match in the dictionary.
        for (const [en, ja] of Object.entries(cityTranslations)) {
            if (loc.includes(en)) {
                return loc.replace(en, ja);
            }
        }
        return loc;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, translateLocation }}>
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
