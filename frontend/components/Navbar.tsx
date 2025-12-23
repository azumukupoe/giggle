"use client";

import Link from "next/link";
import { Music, LogOut, Sun, Moon, Languages } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useLanguage } from "./LanguageContext";
import { useEffect, useState } from "react";

export const Navbar = () => {
    const { data: session } = useSession();
    const { theme, setTheme } = useTheme();
    const { language, setLanguage, t } = useLanguage();
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
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/10 dark:bg-gray-900/80">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-xl">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <Music className="w-5 h-5 text-white" />
                    </div>
                    <span>Giggle</span>
                </div>

                <div className="flex items-center gap-4">
                    {/* Theme Toggle */}
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors">
                        {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>

                    {/* Language Toggle */}
                    <button onClick={toggleLanguage} className="p-2 rounded-full hover:bg-white/10 text-white transition-colors flex items-center gap-1 font-medium text-sm">
                        <Languages className="w-4 h-4" />
                        {language.toUpperCase()}
                    </button>

                    <div className="w-px h-6 bg-white/20 mx-2" />

                    {session && (
                        <div className="flex items-center gap-4">
                            {session.user?.image && (
                                <Image
                                    src={session.user.image}
                                    alt="User"
                                    width={32}
                                    height={32}
                                    className="rounded-full border border-white/20"
                                />
                            )}
                            <button
                                onClick={() => signOut()}
                                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                            >
                                <LogOut className="w-4 h-4" />
                                {t('nav.logout')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};
