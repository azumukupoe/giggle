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
        "nav.connect": "Connect Spotify",
        "nav.logout": "Logout",
        "feed.title": "Your Concert Feed",
        "feed.subtitle": "Upcoming shows for artists you follow.",
        "feed.searchPlaceholder": "Search by artist, venue, or city...",
        "feed.noEvents": "No upcoming concerts found.",
        "feed.syncMore": "Try syncing more artists!",
        "feed.connectPromptSuffix": " to see events for your favorite artists.",
        "feed.following": "Showing events for your {count} followed artists.",
        "feed.allEvents": "You don't follow any artists on Spotify yet. Showing all events.",
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
        "feed.syncMore": "Spotifyでアーティストをもっとフォローしてみましょう！",
        "feed.connectPromptSuffix": "して、お気に入りのアーティストのイベントを表示しましょう。",
        "feed.following": "フォロー中の{count}組のアーティストのイベントを表示しています。",
        "feed.allEvents": "Spotifyでフォローしているアーティストがいません。すべてのイベントを表示します。",
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
