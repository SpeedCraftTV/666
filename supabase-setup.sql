create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null check (post_id ~ '^post([1-9]|1[0-5])$'),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.blog_comments
  drop constraint if exists blog_comments_post_id_check;
alter table public.blog_comments
  add constraint blog_comments_post_id_check
  check (post_id ~ '^post([1-9]|1[0-5])$') not valid;

create table if not exists public.blog_comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.blog_comments(id) on delete cascade,
  reply_id uuid,
  visitor_id uuid not null,
  vote smallint not null check (vote in (-1, 1)),
  unique (comment_id, visitor_id)
);

create table if not exists public.blog_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.blog_comments(id) on delete cascade,
  reply_id uuid,
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
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz;

alter table public.blog_comment_replies
  add column if not exists deleted_at timestamptz;

create index if not exists blog_comments_moderation_idx
  on public.blog_comments (deleted_at, created_at desc);
create index if not exists blog_comment_replies_moderation_idx
  on public.blog_comment_replies (deleted_at, created_at desc);

create table if not exists public.blog_moderation_settings (
  id boolean primary key default true check (id),
  retention_days integer not null default 30
    check (retention_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

insert into public.blog_moderation_settings (id, retention_days)
values (true, 30)
on conflict (id) do nothing;

alter table public.blog_moderation_settings enable row level security;

alter table public.blog_comment_votes
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists reply_id uuid;

alter table public.blog_comment_reports
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists reply_id uuid;

alter table public.blog_comment_votes
  drop constraint if exists blog_comment_votes_reply_id_fkey;
alter table public.blog_comment_votes
  add constraint blog_comment_votes_reply_id_fkey
  foreign key (reply_id)
  references public.blog_comment_replies(id) on delete cascade;

alter table public.blog_comment_reports
  drop constraint if exists blog_comment_reports_reply_id_fkey;
alter table public.blog_comment_reports
  add constraint blog_comment_reports_reply_id_fkey
  foreign key (reply_id)
  references public.blog_comment_replies(id) on delete cascade;

alter table public.blog_comment_replies enable row level security;

create index if not exists blog_comment_replies_comment_created_idx
  on public.blog_comment_replies (comment_id, created_at, id);

create index if not exists blog_comment_replies_parent_created_idx
  on public.blog_comment_replies (parent_reply_id, created_at, id)
  where parent_reply_id is not null;

alter table public.blog_comment_votes
  drop constraint if exists blog_comment_votes_comment_id_visitor_id_key;
drop index if exists public.blog_comment_votes_comment_user_idx;
create unique index if not exists blog_comment_votes_comment_user_idx
  on public.blog_comment_votes (comment_id, user_id)
  where user_id is not null and reply_id is null;
create unique index if not exists blog_comment_votes_reply_user_idx
  on public.blog_comment_votes (reply_id, user_id)
  where user_id is not null and reply_id is not null;

alter table public.blog_comment_reports
  drop constraint if exists blog_comment_reports_comment_id_visitor_id_key;
drop index if exists public.blog_comment_reports_comment_user_idx;
create unique index if not exists blog_comment_reports_comment_user_idx
  on public.blog_comment_reports (comment_id, user_id)
  where user_id is not null and reply_id is null;
create unique index if not exists blog_comment_reports_reply_user_idx
  on public.blog_comment_reports (reply_id, user_id)
  where user_id is not null and reply_id is not null;

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
  using (
    (
      deleted_at is null
      and exists (
        select 1
        from public.blog_comments
        where blog_comments.id = blog_comment_replies.comment_id
          and blog_comments.deleted_at is null
      )
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

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
        and blog_comments.deleted_at is null
    )
    and (
      parent_reply_id is null
      or exists (
        select 1 from public.blog_comment_replies as parent
        where parent.id = blog_comment_replies.parent_reply_id
          and parent.comment_id = blog_comment_replies.comment_id
          and parent.deleted_at is null
      )
    )
  );

drop policy if exists "comments are public" on public.blog_comments;
create policy "comments are public"
  on public.blog_comments for select
  to anon, authenticated
  using (
    deleted_at is null
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "authenticated users can add comments" on public.blog_comments;
create policy "authenticated users can add comments"
  on public.blog_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and post_id ~ '^post([1-9]|1[0-5])$'
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
    and deleted_at is null
    and char_length(btrim(body)) between 1 and 256
  );

drop policy if exists "administrators can moderate comments"
  on public.blog_comments;
create policy "administrators can moderate comments"
  on public.blog_comments for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users can delete their own comments" on public.blog_comments;
create policy "users can delete their own comments"
  on public.blog_comments for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "administrators can delete any comment"
  on public.blog_comments;
drop policy if exists admin_delete_comments on public.blog_comments;
drop policy if exists "administrators can permanently delete comments"
  on public.blog_comments;
create policy "administrators can permanently delete comments"
  on public.blog_comments for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users can edit their own replies"
  on public.blog_comment_replies;
create policy "users can edit their own replies"
  on public.blog_comment_replies for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and deleted_at is null
    and char_length(btrim(body)) between 1 and 256
  );

drop policy if exists "administrators can moderate replies"
  on public.blog_comment_replies;
create policy "administrators can moderate replies"
  on public.blog_comment_replies for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users can delete their own replies"
  on public.blog_comment_replies;
create policy "users can delete their own replies"
  on public.blog_comment_replies for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "administrators can delete any reply"
  on public.blog_comment_replies;
drop policy if exists admin_delete_replies on public.blog_comment_replies;
drop policy if exists "administrators can permanently delete replies"
  on public.blog_comment_replies;
create policy "administrators can permanently delete replies"
  on public.blog_comment_replies for delete
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "administrators can manage moderation settings"
  on public.blog_moderation_settings;
create policy "administrators can manage moderation settings"
  on public.blog_moderation_settings for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "visitors can vote" on public.blog_comment_votes;
drop policy if exists "authenticated users can vote" on public.blog_comment_votes;
create policy "authenticated users can vote"
  on public.blog_comment_votes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and vote in (-1, 1)
    and (
      reply_id is null
      or exists (
        select 1 from public.blog_comment_replies as target_reply
        where target_reply.id = blog_comment_votes.reply_id
          and target_reply.comment_id = blog_comment_votes.comment_id
      )
    )
  );

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
grant select (id, post_id, author_name, body, created_at, deleted_at)
  on public.blog_comments to anon, authenticated;
grant select (user_id) on public.blog_comments to authenticated;
grant insert (post_id, author_name, body, user_id) on public.blog_comments to authenticated;
grant update (body) on public.blog_comments to authenticated;
grant update (deleted_at) on public.blog_comments to authenticated;
grant delete on public.blog_comments to authenticated;
revoke select, insert, update, delete on public.blog_comment_votes from public, anon, authenticated;
grant select (comment_id, reply_id, vote) on public.blog_comment_votes to anon;
grant select (comment_id, reply_id, user_id, vote) on public.blog_comment_votes to authenticated;
grant insert (comment_id, reply_id, visitor_id, vote, user_id) on public.blog_comment_votes to authenticated;
grant update (vote) on public.blog_comment_votes to authenticated;
grant delete on public.blog_comment_votes to authenticated;
revoke all on public.blog_comment_reports from anon, authenticated;
revoke all on public.blog_comment_replies from public, anon, authenticated;
grant select (id, comment_id, parent_reply_id, author_name, body, created_at, deleted_at)
  on public.blog_comment_replies to anon, authenticated;
grant select (user_id) on public.blog_comment_replies to authenticated;
grant insert (comment_id, parent_reply_id, user_id, author_name, body)
  on public.blog_comment_replies to authenticated;
grant update (body) on public.blog_comment_replies to authenticated;
grant update (deleted_at) on public.blog_comment_replies to authenticated;
grant delete on public.blog_comment_replies to authenticated;
revoke all on public.blog_moderation_settings from public, anon, authenticated;
grant select (id, retention_days, updated_at)
  on public.blog_moderation_settings to authenticated;
grant update (retention_days, updated_at)
  on public.blog_moderation_settings to authenticated;
grant select on public.blog_comments to service_role;
grant insert on public.blog_comment_reports to service_role;

create or replace function public.purge_expired_blog_moderation_archive()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  retention integer;
  removed_count integer := 0;
  current_count integer := 0;
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Administrator access required.';
  end if;

  select retention_days
    into retention
    from public.blog_moderation_settings
    where id = true;

  if retention is null then
    raise exception 'Moderation archive settings are missing.';
  end if;

  delete from public.blog_comment_replies
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => retention);
  get diagnostics current_count = row_count;
  removed_count := removed_count + current_count;

  delete from public.blog_comments
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => retention);
  get diagnostics current_count = row_count;
  removed_count := removed_count + current_count;

  return removed_count;
end;
$$;

revoke all on function public.purge_expired_blog_moderation_archive()
  from public, anon, authenticated;
grant execute on function public.purge_expired_blog_moderation_archive()
  to authenticated;

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
        and comments.deleted_at is null
    left join lateral (
      select count(*) as reply_count
      from public.blog_comment_replies as comment_replies
      where comment_replies.comment_id = comments.id
        and comment_replies.deleted_at is null
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
          and comment_replies.deleted_at is null
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
