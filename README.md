# GigPulse 🎸

A free, hybrid-architecture web application that aggregates concert dates for your favorite Spotify artists from Bandsintown, Songkick, SeatGeek, and Ticketmaster.

## 🌟 Features

*   **Smart Sync**: Log in with Spotify to automatically track your followed artists.
*   **Unified Feed**: See events from multiple sources in one clean interface.
*   **0% Cost**: Designed to run entirely on free tiers (Vercel, GitHub Actions, Supabase).
*   **Robust Scraping**: Uses SEO-friendly JSON-LD extraction for reliable data access without API keys.

## 🏗 Architecture

*   **Frontend**: Next.js 14, Tailwind CSS, Framer Motion (Hosted on Vercel).
*   **Database**: Supabase (PostgreSQL).
*   **Ingestion**: Python scripts scheduled via GitHub Actions (Runs daily).

## 🚀 Setup Instructions

### 1. Database (Supabase)
1.  Create a free project on [Supabase](https://supabase.com/).
2.  Go to the **SQL Editor** in your Supabase dashboard.
3.  Copy and paste the contents of `supabase_schema.sql` (in this repo) and run it.
4.  Note your `SUPABASE_URL` and `SUPABASE_KEY` (anon public key) from Project Settings > API.
5.  Get your **Database Connection String** (for Python) from Project Settings > Database.

### 2. Environment Variables
You need to set up variables for both the Frontend (Vercel) and Backend (GitHub Actions).

#### Frontend (.env.local)
See `frontend/.env.example`.
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
NEXTAUTH_SECRET=generate_a_random_string
NEXTAUTH_URL=http://localhost:3000 (or your vercel domain)
```

#### Backend (GitHub Secrets)
See `ingestion/.env.example`.
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_service_role_key_OR_anon_key
TICKETMASTER_API_KEY=your_ticketmaster_key
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
# Install 'uv' if you haven't: pip install uv
uv sync
uv run main.py
```

## 📦 Deployment

### Frontend (Vercel)
1.  Push this code to a GitHub repository.
2.  Go to [Vercel](https://vercel.com/) and "Add New Project".
3.  Import your repository.
4.  In "Environment Variables", add all variables from the **Frontend** section above.
5.  Deploy!

### Backend (GitHub Actions)
1.  In your GitHub Repository, go to **Settings > Secrets and variables > Actions**.
2.  Add the following **Repository Secrets**:
    *   `SUPABASE_URL`
    *   `SUPABASE_KEY`
    *   `TICKETMASTER_API_KEY`
3.  The workflow is already configured in `.github/workflows/ingest.yml`. It will run automatically every day at 8:00 AM UTC.
4.  You can also go to the "Actions" tab and manually trigger the "Daily Concert Ingestion" workflow to test it.

## 🛡️ scraping Note
This project uses lightweight scraping techniques targeting `JSON-LD` data. This is more robust than traditional scraping but can still be subject to website changes. Usage is intended for personal/developer educational purposes.
