create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null check (post_id ~ '^post([1-9]|10)$'),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.blog_comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.blog_comments(id) on delete cascade,
  visitor_id uuid not null,
  vote smallint not null check (vote in (-1, 1)),
  unique (comment_id, visitor_id)
);

create table if not exists public.blog_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.blog_comments(id) on delete cascade,
  visitor_id uuid not null,
  reporter_name text not null default '',
  reporter_email text not null default '',
  message text not null default '',
  created_at timestamptz not null default now(),
  unique (comment_id, visitor_id)
);

alter table public.blog_comment_reports
  add column if not exists reporter_name text not null default '',
  add column if not exists reporter_email text not null default '',
  add column if not exists message text not null default '';

create table if not exists public.blog_report_rate_limits (
  rate_key text primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.blog_report_rate_limits enable row level security;

create or replace function public.claim_blog_report_rate_limit(p_rate_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.blog_report_rate_limits as limits (rate_key, last_sent_at)
  values (p_rate_key, now())
  on conflict (rate_key) do update
    set last_sent_at = excluded.last_sent_at
    where limits.last_sent_at < now() - interval '1 minute';
  return found;
end;
$$;

revoke all on public.blog_report_rate_limits from public, anon, authenticated;
revoke all on function public.claim_blog_report_rate_limit(text) from public, anon, authenticated;
grant execute on function public.claim_blog_report_rate_limit(text) to service_role;

alter table public.blog_comments enable row level security;
alter table public.blog_comment_votes enable row level security;
alter table public.blog_comment_reports enable row level security;

drop policy if exists "comments are public" on public.blog_comments;
create policy "comments are public"
  on public.blog_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "visitors can add comments" on public.blog_comments;
create policy "visitors can add comments"
  on public.blog_comments for insert
  to anon, authenticated
  with check (
    post_id ~ '^post([1-9]|10)$'
    and char_length(btrim(author_name)) between 1 and 40
    and char_length(btrim(body)) between 1 and 500
  );

drop policy if exists "vote totals are public" on public.blog_comment_votes;
create policy "vote totals are public"
  on public.blog_comment_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "visitors can vote" on public.blog_comment_votes;
create policy "visitors can vote"
  on public.blog_comment_votes for insert
  to anon, authenticated
  with check (vote in (-1, 1));

drop policy if exists "visitors can change their vote" on public.blog_comment_votes;
create policy "visitors can change their vote"
  on public.blog_comment_votes for update
  to anon, authenticated
  using (true)
  with check (vote in (-1, 1));

drop policy if exists "visitors can remove their vote" on public.blog_comment_votes;
create policy "visitors can remove their vote"
  on public.blog_comment_votes for delete
  to anon, authenticated
  using (true);

drop policy if exists "visitors can report comments" on public.blog_comment_reports;

grant select, insert on public.blog_comments to anon, authenticated;
grant select on public.blog_comment_votes to anon, authenticated;
grant insert (comment_id, visitor_id, vote) on public.blog_comment_votes to anon, authenticated;
grant update (vote) on public.blog_comment_votes to anon, authenticated;
grant delete on public.blog_comment_votes to anon, authenticated;
revoke all on public.blog_comment_reports from anon, authenticated;
grant select on public.blog_comments to service_role;
grant insert on public.blog_comment_reports to service_role;
