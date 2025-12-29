import { Navbar } from "@/components/Navbar";
import { Feed } from "@/components/Feed";

export default function Home() {
  return (
    <main className="h-screen bg-white dark:bg-black text-black dark:text-white relative overflow-hidden selection:bg-purple-500 selection:text-white">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 dark:bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 dark:bg-blue-900/20 blur-[120px]" />
      </div>

      <Navbar />

      <div className="relative z-10 pt-24 pb-24 h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 mb-8">
          {/* Header Removed as requested */}
        </div>

        <Feed />
      </div>
    </main>
  );
}
