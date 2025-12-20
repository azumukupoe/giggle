import { Navbar } from "@/components/Navbar";
import { Feed } from "@/components/Feed";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white relative overflow-x-hidden selection:bg-purple-500 selection:text-white">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/20 blur-[120px]" />
      </div>

      <Navbar />

      <div className="relative z-10 pt-24 pb-10">
        <div className="max-w-7xl mx-auto px-6 mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">
            Your Concert Feed
          </h1>
          <p className="text-gray-400 text-lg">
            Upcoming shows for artists you follow.
          </p>
        </div>

        <Feed />
      </div>
    </main>
  );
}
