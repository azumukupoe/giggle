"use client";

import Link from "next/link";
import { Music, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";

export const Navbar = () => {
    const { data: session } = useSession();

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/10">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-xl">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <Music className="w-5 h-5 text-white" />
                    </div>
                    <span>GigPulse</span>
                </div>

                <div className="flex items-center gap-4">
                    {session ? (
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
                                Logout
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => signIn("spotify")}
                            className="px-4 py-2 rounded-full bg-[#1DB954] text-black font-bold hover:bg-[#1ed760] transition-colors flex items-center gap-2 text-sm"
                        >
                            <Music className="w-4 h-4 fill-current" />
                            <span>Connect Spotify</span>
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
};
