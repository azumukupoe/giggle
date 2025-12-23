# Giggle 🎸

A free, hybrid-architecture web application (Google for Gigs) that aggregates concert dates for your favorite Spotify artists from Songkick, Ticket Pia, and Eplus.

[Japanese README (README_JA.md)](README_JA.md)

---

## 🌟 Features

*   **Smart Sync**: Log in with Spotify to automatically track your followed artists.
*   **Unified Feed**: See events from multiple sources (Songkick, Pia, Eplus) in one clean interface with search and pagination.
*   **Bilingual Support**: Seamlessly switch between English and Japanese.
*   **Dark Mode**: Beautiful dark and light theme support.
*   **Advanced Filtering**: Uses Eplus API V3 and strict keyword exclusion to ensure only music concerts (no museum/zoo tickets) are ingested.
*   **0% Cost**: Designed to run entirely on free tiers (Vercel, GitHub Actions, Supabase).

## 🏗 Architecture

*   **Frontend**: Next.js 14, Tailwind CSS, Framer Motion, `next-themes`, `i18next`-style context (Hosted on Vercel).
*   **Database**: Supabase (PostgreSQL).
*   **Ingestion**: Python scripts using `uv` scheduled via GitHub Actions (Runs daily).

## 🚀 Setup Instructions

### 1. Database (Supabase)
1.  Create a free project on [Supabase](https://supabase.com/).
2.  Use the **SQL Editor** to run the contents of `supabase_schema.sql`.
3.  Note your `SUPABASE_URL` and `SUPABASE_KEY` (anon public key).
4.  Get your **Database Connection String** for the Python ingestion scripts.

### 2. Environment Variables

#### Frontend (.env.local)
See `frontend/.env.example`.
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_a_random_string
NEXTAUTH_URL=http://localhost:3000
```

#### Backend (GitHub Secrets)
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key
```

### 3. Local Development

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend (Ingestion):**
```bash
cd ingestion
# Uses 'uv' for high-speed dependency management
uv sync
uv run main.py
```

## 📦 Deployment

### Frontend (Vercel)
Connect your repo to Vercel and add the environment variables listed above.

### Backend (GitHub Actions)
Add `SUPABASE_URL` and `SUPABASE_KEY` to **Settings > Secrets and variables > Actions**. The workflow (`.github/workflows/ingest.yml`) is scheduled to run daily at 8:00 AM UTC.

## 🛡️ Note
This project uses lightweight scraping and API integrations for educational purposes.
