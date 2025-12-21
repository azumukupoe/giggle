-- Create Artists Table to track who to scrape
create table public.artists (
  name text primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.artists enable row level security;

-- Policy: Authenticated users (and anon for now) can insert artists
create policy "Allow public insert"
  on public.artists
  for insert
  to public
  with check (true);

-- Policy: Everyone can read
create policy "Allow public select"
  on public.artists
  for select
  to public
  using (true);
