"use client";

import { Music, Sun, Moon, Languages } from "lucide-react";
import { useTheme } from "next-themes";
import { useLanguage } from "./LanguageContext";
import { useEffect, useState } from "react";

export const Navbar = () => {
    const { theme, setTheme } = useTheme();
    const { language, setLanguage } = useLanguage();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const toggleLanguage = () => {
        setLanguage(language === "en" ? "ja" : "en");
    };

    if (!mounted) return null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/50 dark:bg-black/50 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 transition-colors">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold text-xl">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <Music className="w-5 h-5 text-white" />
                    </div>
                    <span>Giggle</span>
                </div>

                <div className="flex items-center gap-4">
                    {/* Theme Toggle */}
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-white transition-colors">
                        {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>

                    {/* Language Toggle */}
                    <button onClick={toggleLanguage} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-white transition-colors flex items-center gap-1 font-medium text-sm">
                        <Languages className="w-4 h-4" />
                        {language.toUpperCase()}
                    </button>
                </div>
            </div>
        </nav>
    );
};
