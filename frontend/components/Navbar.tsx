"use client";

import { ThemeToggle } from "./ThemeToggle";
import { useLanguage } from "./LanguageContext";
import { useEffect, useState } from "react";

export const Navbar = () => {
    const { language, setLanguage } = useLanguage();
    const [mounted, setMounted] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setMounted(true), []);

    const toggleLanguage = () => {
        setLanguage(language === "en" ? "ja" : "en");
    };

    if (!mounted) return null;

    return (
        <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex-shrink-0">
                        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                            Giggle
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleLanguage}
                            className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors font-medium text-sm"
                        >
                            {language === 'en' ? 'EN' : 'JA'}
                        </button>
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </nav>
    );
};
