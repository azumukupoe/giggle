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
        "feed.searchPlaceholder": "Search by artist, venue, or city...",
        "feed.noEvents": "No upcoming concerts found.",
        "feed.eventsFound": "{count} events found",
        "feed.loading": "Loading events...",
        "theme.light": "Light",
        "theme.dark": "Dark",
        "theme.system": "System",
    },
    ja: {
        "feed.searchPlaceholder": "アーティスト、会場、都市で検索...",
        "feed.noEvents": "予定されているコンサートは見つかりませんでした。",
        "feed.eventsFound": "{count} 件のイベント",
        "feed.loading": "読み込み中...",
        "theme.light": "ライト",
        "theme.dark": "ダーク",
        "theme.system": "システム",
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

    const t = (key: string, args?: Record<string, string | number>): string => {
        // @ts-ignore
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
