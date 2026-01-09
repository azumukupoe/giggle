import { Navbar } from "@/components/layout/Navbar";
import { Feed } from "@/components/features/events/Feed";

export default function Home() {
  return (
    <main className="h-screen bg-white dark:bg-black text-black dark:text-white relative overflow-hidden selection:bg-purple-500 selection:text-white flex flex-col">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 dark:bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 dark:bg-blue-900/20 blur-[120px]" />
      </div>

      <Navbar />

      <div className="relative z-10 pt-20 pb-0 h-full flex flex-col overflow-hidden">


        <div className="flex-1 overflow-hidden">
          <Feed />
        </div>
      </div>
    </main>
  );
}
