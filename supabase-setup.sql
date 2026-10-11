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
  created_at timestamptz not null default now(),
  unique (comment_id, visitor_id)
);

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

drop policy if exists "visitors can report comments" on public.blog_comment_reports;
create policy "visitors can report comments"
  on public.blog_comment_reports for insert
  to anon, authenticated
  with check (true);

grant select, insert on public.blog_comments to anon, authenticated;
grant select, insert on public.blog_comment_votes to anon, authenticated;
grant insert on public.blog_comment_reports to anon, authenticated;
