create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null check (post_id ~ '^post([1-9]|1[012])$'),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.blog_comments
  drop constraint if exists blog_comments_post_id_check;
alter table public.blog_comments
  add constraint blog_comments_post_id_check
  check (post_id ~ '^post([1-9]|1[012])$') not valid;

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

create table if not exists public.blog_comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.blog_comments(id) on delete cascade,
  parent_reply_id uuid references public.blog_comment_replies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.blog_comments
  drop constraint if exists blog_comments_body_check,
  drop constraint if exists blog_comments_body_length_check;
alter table public.blog_comments
  add constraint blog_comments_body_length_check
  check (char_length(btrim(body)) between 1 and 256) not valid;

alter table public.blog_comment_replies
  drop constraint if exists blog_comment_replies_body_check,
  drop constraint if exists blog_comment_replies_body_length_check;
alter table public.blog_comment_replies
  add constraint blog_comment_replies_body_length_check
  check (char_length(btrim(body)) between 1 and 256) not valid;

alter table public.blog_comment_replies
  add column if not exists parent_reply_id uuid
  references public.blog_comment_replies(id) on delete cascade;

alter table public.blog_comment_replies
  drop constraint if exists blog_comment_replies_parent_reply_id_fkey;
alter table public.blog_comment_replies
  add constraint blog_comment_replies_parent_reply_id_fkey
  foreign key (parent_reply_id)
  references public.blog_comment_replies(id) on delete set null;

alter table public.blog_comments
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.blog_comment_votes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.blog_comment_reports
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.blog_comment_replies enable row level security;

create index if not exists blog_comment_replies_comment_created_idx
  on public.blog_comment_replies (comment_id, created_at, id);

create index if not exists blog_comment_replies_parent_created_idx
  on public.blog_comment_replies (parent_reply_id, created_at, id)
  where parent_reply_id is not null;

create unique index if not exists blog_comment_votes_comment_user_idx
  on public.blog_comment_votes (comment_id, user_id)
  where user_id is not null;

create unique index if not exists blog_comment_reports_comment_user_idx
  on public.blog_comment_reports (comment_id, user_id)
  where user_id is not null;

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

drop policy if exists "comment replies are public" on public.blog_comment_replies;
create policy "comment replies are public"
  on public.blog_comment_replies for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated users can add comment replies"
  on public.blog_comment_replies;
create policy "authenticated users can add comment replies"
  on public.blog_comment_replies for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and char_length(btrim(author_name)) between 1 and 40
    and author_name = left(coalesce(
      nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'nickname'), ''),
      split_part(auth.jwt() ->> 'email', '@', 1)
    ), 40)
    and char_length(btrim(body)) between 1 and 256
    and exists (
      select 1 from public.blog_comments
      where blog_comments.id = blog_comment_replies.comment_id
    )
    and (
      parent_reply_id is null
      or exists (
        select 1 from public.blog_comment_replies as parent
        where parent.id = blog_comment_replies.parent_reply_id
          and parent.comment_id = blog_comment_replies.comment_id
      )
    )
  );

drop policy if exists "comments are public" on public.blog_comments;
create policy "comments are public"
  on public.blog_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated users can add comments" on public.blog_comments;
create policy "authenticated users can add comments"
  on public.blog_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and post_id ~ '^post([1-9]|1[012])$'
    and char_length(btrim(author_name)) between 1 and 40
    and author_name = left(coalesce(
      nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'nickname'), ''),
      split_part(auth.jwt() ->> 'email', '@', 1)
    ),
      40
    )
    and char_length(btrim(body)) between 1 and 256
  );

drop policy if exists "users can edit their own comments" on public.blog_comments;
create policy "users can edit their own comments"
  on public.blog_comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and char_length(btrim(body)) between 1 and 256
  );

drop policy if exists "users can delete their own comments" on public.blog_comments;
create policy "users can delete their own comments"
  on public.blog_comments for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can edit their own replies"
  on public.blog_comment_replies;
create policy "users can edit their own replies"
  on public.blog_comment_replies for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and char_length(btrim(body)) between 1 and 256
  );

drop policy if exists "users can delete their own replies"
  on public.blog_comment_replies;
create policy "users can delete their own replies"
  on public.blog_comment_replies for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "visitors can vote" on public.blog_comment_votes;
drop policy if exists "authenticated users can vote" on public.blog_comment_votes;
create policy "authenticated users can vote"
  on public.blog_comment_votes for insert
  to authenticated
  with check (auth.uid() = user_id and vote in (-1, 1));

drop policy if exists "visitors can change their vote" on public.blog_comment_votes;
drop policy if exists "authenticated users can change their vote" on public.blog_comment_votes;
create policy "authenticated users can change their vote"
  on public.blog_comment_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and vote in (-1, 1));

drop policy if exists "visitors can remove their vote" on public.blog_comment_votes;
drop policy if exists "authenticated users can remove their vote" on public.blog_comment_votes;
create policy "authenticated users can remove their vote"
  on public.blog_comment_votes for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "visitors can add comments" on public.blog_comments;

drop policy if exists "vote totals are public" on public.blog_comment_votes;
create policy "vote totals are public"
  on public.blog_comment_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "visitors can report comments" on public.blog_comment_reports;

revoke select, insert on public.blog_comments from public, anon, authenticated;
revoke update, delete on public.blog_comments from public, anon, authenticated;
grant select (id, post_id, author_name, body, created_at)
  on public.blog_comments to anon, authenticated;
grant select (user_id) on public.blog_comments to authenticated;
grant insert (post_id, author_name, body, user_id) on public.blog_comments to authenticated;
grant update (body) on public.blog_comments to authenticated;
grant delete on public.blog_comments to authenticated;
revoke select, insert, update, delete on public.blog_comment_votes from public, anon, authenticated;
grant select (comment_id, vote) on public.blog_comment_votes to anon;
grant select (comment_id, user_id, vote) on public.blog_comment_votes to authenticated;
grant insert (comment_id, visitor_id, vote, user_id) on public.blog_comment_votes to authenticated;
grant update (vote) on public.blog_comment_votes to authenticated;
grant delete on public.blog_comment_votes to authenticated;
revoke all on public.blog_comment_reports from anon, authenticated;
revoke all on public.blog_comment_replies from public, anon, authenticated;
grant select (id, comment_id, parent_reply_id, author_name, body, created_at)
  on public.blog_comment_replies to anon, authenticated;
grant select (user_id) on public.blog_comment_replies to authenticated;
grant insert (comment_id, parent_reply_id, user_id, author_name, body)
  on public.blog_comment_replies to authenticated;
grant update (body) on public.blog_comment_replies to authenticated;
grant delete on public.blog_comment_replies to authenticated;
grant select on public.blog_comments to service_role;
grant insert on public.blog_comment_reports to service_role;

create or replace function public.get_blog_comment_reply_previews(
  p_comment_ids uuid[]
)
returns table (
  comment_id uuid,
  reply_count bigint,
  previews jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_comment_ids is null or cardinality(p_comment_ids) = 0 then
    return;
  end if;
  if cardinality(p_comment_ids) > 500 then
    raise exception 'At most 500 comment IDs can be requested.';
  end if;

  return query
    with requested_comments as (
      select distinct requested.id
      from unnest(p_comment_ids) as requested(id)
    )
    select
      comments.id,
      reply_counts.reply_count,
      coalesce(
        reply_previews.previews,
        '[]'::jsonb
      )
    from requested_comments
    join public.blog_comments as comments
      on comments.id = requested_comments.id
    left join lateral (
      select count(*) as reply_count
      from public.blog_comment_replies as comment_replies
      where comment_replies.comment_id = comments.id
    ) as reply_counts on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', top_replies.id,
          'author_name', top_replies.author_name,
          'body', top_replies.body,
          'created_at', top_replies.created_at,
          'parent_reply_id', top_replies.parent_reply_id
        )
        order by top_replies.created_at, top_replies.id
      ) as previews
      from (
        select
          comment_replies.id,
          comment_replies.author_name,
          comment_replies.body,
          comment_replies.created_at,
          comment_replies.parent_reply_id
        from public.blog_comment_replies as comment_replies
        where comment_replies.comment_id = comments.id
          and comment_replies.parent_reply_id is null
        order by comment_replies.created_at, comment_replies.id
        limit 3
      ) as top_replies
    ) as reply_previews on true;
end;
$$;

revoke all on function public.get_blog_comment_reply_previews(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_blog_comment_reply_previews(uuid[])
  to anon, authenticated;

notify pgrst, 'reload schema';
