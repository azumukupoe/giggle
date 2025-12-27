-- Create Events Table
create table public.events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  artist text not null,
  venue text not null,
  location text,
  date timestamp with time zone not null,
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
