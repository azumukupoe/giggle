"use client"

import { useState, useSyncExternalStore } from "react"
import { Moon, Sun, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"

import { useLanguage } from "@/components/providers/LanguageContext"

// Hydration-safe mounted check using useSyncExternalStore
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
    const { setTheme, theme } = useTheme()
    const { t } = useLanguage()
    const [isOpen, setIsOpen] = useState(false)
    const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    if (!mounted) {
        // Render a placeholder to avoid layout shift
        return <div className="w-9 h-9 opacity-0" />
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors flex items-center justify-center"
                aria-label="Toggle theme"
            >
                {theme === 'system' ? (
                    <Laptop className="w-5 h-5" />
                ) : theme === 'dark' ? (
                    <Moon className="w-5 h-5" />
                ) : (
                    <Sun className="w-5 h-5" />
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-0 mt-2 w-36 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-50 overflow-hidden"
                        >
                            <div className="flex flex-col p-1">
                                <button
                                    onClick={() => { setTheme("light"); setIsOpen(false) }}
                                    className={`flex items-center gap-2 px-2 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors w-full text-left ${theme === 'light' ? 'bg-accent/50 text-accent-foreground' : ''}`}
                                >
                                    <Sun className="w-4 h-4" /> {t('theme.light')}
                                </button>
                                <button
                                    onClick={() => { setTheme("dark"); setIsOpen(false) }}
                                    className={`flex items-center gap-2 px-2 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors w-full text-left ${theme === 'dark' ? 'bg-accent/50 text-accent-foreground' : ''}`}
                                >
                                    <Moon className="w-4 h-4" /> {t('theme.dark')}
                                </button>
                                <button
                                    onClick={() => { setTheme("system"); setIsOpen(false) }}
                                    className={`flex items-center gap-2 px-2 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors w-full text-left ${theme === 'system' ? 'bg-accent/50 text-accent-foreground' : ''}`}
                                >
                                    <Laptop className="w-4 h-4" /> {t('theme.system')}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
