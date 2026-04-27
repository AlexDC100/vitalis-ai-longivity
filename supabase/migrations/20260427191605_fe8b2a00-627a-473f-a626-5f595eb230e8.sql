create table if not exists public.user_privacy_settings (
  user_id uuid primary key,
  keep_snapshots boolean not null default true,
  keep_documents boolean not null default true,
  retention_days integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_privacy_settings enable row level security;

create policy "Users can view own privacy settings"
  on public.user_privacy_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own privacy settings"
  on public.user_privacy_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own privacy settings"
  on public.user_privacy_settings for update
  using (auth.uid() = user_id);

create policy "Users can delete own privacy settings"
  on public.user_privacy_settings for delete
  using (auth.uid() = user_id);

create trigger update_user_privacy_settings_updated_at
  before update on public.user_privacy_settings
  for each row execute function public.update_updated_at_column();