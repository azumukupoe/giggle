"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ja';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const translations = {
    en: {
        "feed.searchPlaceholder": "Search by artist, venue, or city...",
        "feed.noEvents": "No upcoming concerts found.",
        "feed.loading": "Loading events...",
        "card.date": "Date",
        "card.venue": "Venue",
        "card.location": "Location",
        "card.source": "Source",
    },
    ja: {
        "feed.searchPlaceholder": "アーティスト、会場、都市で検索...",
        "feed.noEvents": "予定されているコンサートは見つかりませんでした。",
        "feed.loading": "読み込み中...",
        "card.date": "日付",
        "card.venue": "会場",
        "card.location": "場所",
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
