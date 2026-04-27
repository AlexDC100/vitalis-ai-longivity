-- Consultation requests captured by the in-app booking flow.
create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  partner_id text not null,
  specialty text not null,
  severity text,
  full_name text not null,
  email text not null,
  phone text,
  notes text,
  preferred_time text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.consultation_requests enable row level security;

-- Authenticated users can insert their own requests
create policy "Users insert own consultation requests"
on public.consultation_requests for insert
to authenticated
with check (auth.uid() = user_id);

-- Authenticated users can read their own requests
create policy "Users read own consultation requests"
on public.consultation_requests for select
to authenticated
using (auth.uid() = user_id);

-- Optional: anonymous users can submit (user_id null) — keep disabled for safety.
