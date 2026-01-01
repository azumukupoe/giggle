# giggle

Giggle is an event aggregation platform designed to collect and display event information from various sources such as [Pia](https://t.pia.jp/), [Eplus](https://eplus.jp/), and [Songkick](https://www.songkick.com/). It features a modern, responsive web interface built with Next.js and a robust data ingestion pipeline written in Python.

## Features
- **Event Aggregation**: Automatically scrapes and standardizes event data from supported ticketing platforms.
- **Unified Display**: Browse events from multiple sources in a single, clean interface.
- **Search & Filter**: Filter events by date, venue, etc.
- **Responsive Design**: optimized for both desktop and mobile viewing.

## Project Structure

- **`frontend/`**: The web application built with Next.js (App Router).
- **`ingestion/`**: Python scripts and modules for scraping and ingesting event data.

## Technologies Used

### Frontend
- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database Client**: [Supabase JS](https://supabase.com/docs/reference/javascript/introduction)

### Ingestion (Backend)
- **Language**: Python 3.13+
- **Dependency Management**: [uv](https://github.com/astral-sh/uv)
- **HTTP Clients**: `httpx`, `aiohttp`, `requests`
- **Parsing**: `BeautifulSoup4`
- **Database Client**: `supabase-py`

## Setup & Installation

### Prerequisites
- Node.js & npm
- Python 3.13+
- `uv` (Python package manager)
- A Supabase project

### 1. Database Setup
Run the following SQL commands in your Supabase project's SQL editor to create the necessary tables and policies:

```sql
-- Create Events Table
create table public.events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  artist text not null,
  venue text not null,
  location text,
  date date not null,
  time time without time zone,
  ticket_name text,
  url text not null,
  unique(url)
);

-- Enable RLS (Row Level Security)
alter table public.events enable row level security;

-- Policy: Everyone can read events
create policy "Allow public read access"
  on public.events
  for select
  to public
  using (true);

-- Policy: Only service_role (backend) can insert/update
-- (Implicitly true if no other policies exist for Insert/Update, 
-- but explicit is better or relying on service role key bypasses RLS)
```

### 2. Ingestion Setup

1. Navigate to the `ingestion` directory:
   ```bash
   cd ingestion
   ```
2. Create a `.env` file based on `.env.example` and add your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   ```
3. Install dependencies using `uv`:
   ```bash
   uv sync
   ```
4. Run the ingestion script:
   ```bash
   uv run main.py
   ```

### 3. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Create a `.env.local` file based on `.env.example`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) to view the application.