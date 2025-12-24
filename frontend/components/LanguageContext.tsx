"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ja';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    translateLocation: (loc: string) => string;
    translateVenue: (venue: string) => string;
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
        "Hokkaido": "北海道",
        "Aichi": "愛知",
        "Kanagawa": "神奈川",
        "Hyogo": "兵庫",
        "Nara": "奈良",
        "Shizuoka": "静岡",
        "Niigata": "新潟",
        "Nagano": "長野",
        "Ishikawa": "石川",
        "Okayama": "岡山",
        "Kumamoto": "熊本",
        "Kagoshima": "鹿児島",
    };

    const venueTranslations: Record<string, string> = {
        "Tokyo Dome": "東京ドーム",
        "Budokan": "日本武道館",
        "Nippon Budokan": "日本武道館",
        "Saitama Super Arena": "さいたまスーパーアリーナ",
        "Yokohama Arena": "横浜アリーナ",
        "Makuhari Messe": "幕張メッセ",
        "Toyosu PIT": "豊洲PIT",
        "Akasaka Blitz": "赤坂BLITZ",
        "Nakano Sunplaza": "中野サンプラザ",
        "NHK Hall": "NHKホール",
        "Tokyo International Forum": "東京国際フォーラム",
        "Osaka Jo Hall": "大阪城ホール",
        "Fukuoka PayPay Dome": "福岡PayPayドーム",
        "Kyocera Dome Osaka": "京セラドーム大阪",
        "Sapporo Dome": "札幌ドーム",
        "Belluna Dome": "ベルーナドーム",
        "Vantelin Dome Nagoya": "バンテリンドーム ナゴヤ",
        "PIA Arena MM": "ぴあアリーナMM",
        "K Arena Yokohama": "Kアリーナ横浜",
        "Ariake Arena": "有明アリーナ",
        "Musashino Forest Sport Plaza": "武蔵野の森総合スポーツプラザ",
    };

    const translateLocation = (loc: string): string => {
        if (language !== 'ja') return loc;
        for (const [en, ja] of Object.entries(cityTranslations)) {
            if (loc.includes(en)) {
                return loc.replace(en, ja);
            }
        }
        return loc;
    };

    const translateVenue = (venue: string): string => {
        if (language !== 'ja') return venue;
        // Try exact match first
        if (venueTranslations[venue]) return venueTranslations[venue];
        // Try partial match
        for (const [en, ja] of Object.entries(venueTranslations)) {
            if (venue.toLowerCase().includes(en.toLowerCase())) {
                return venue.replace(new RegExp(en, "i"), ja);
            }
        }
        return venue;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, translateLocation, translateVenue }}>
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
