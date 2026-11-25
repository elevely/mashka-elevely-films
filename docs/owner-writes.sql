-- REVIEW REQUIRED. Never run against production before a verified backup and owner approval.
-- Replace BOTH UUID markers below with the two Auth IDs; keep the same values in server env.
-- This transaction changes functions, policies, grants and a trigger; it never rewrites movie rows.
-- Requires nullable missing ratings/totals (audit FIRST), bigint-compatible id and legacy columns.
begin;
create or replace function public.films_actor() returns text language sql stable security invoker set search_path='' as $$
  select case auth.uid()
    when 'REPLACE_ELEVELY_UUID'::uuid then 'elevely'
    when 'REPLACE_MASHKA_UUID'::uuid then 'mashka'
  end;
$$;
-- Fail during installation if the placeholders or duplicate IDs were not corrected.
do $$ begin
  if 'REPLACE_ELEVELY_UUID'::uuid = 'REPLACE_MASHKA_UUID'::uuid then raise exception 'Distinct Auth users required'; end if;
end $$;

create or replace function public.films_raw_score(r jsonb) returns double precision
language plpgsql immutable security invoker set search_path='' as $$
declare i integer; v double precision; total double precision := 0;
begin
  if r is null or r='null'::jsonb then return null; end if;
  if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>5 then raise exception 'Five ratings required' using errcode='22023'; end if;
  for i in 0..4 loop
    if jsonb_typeof(r->i)<>'number' then raise exception 'Numeric rating required' using errcode='22023'; end if;
    v := (r->>i)::double precision;
    if v<0 or v>10 or v*2<>floor(v*2) then raise exception 'Rating out of range' using errcode='22023'; end if;
    total := total + v * case when i=4 then 1.5 else 1 end;
  end loop;
  return total / 5.5 * 10;
end $$;

create or replace function public.films_guard_review() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor text := public.films_actor(); mine text; other text; note_key text; total_key text;
  a double precision; b double precision; ratings_changed boolean; locked_id bigint; film jsonb;
begin
  if actor is null then raise exception 'Only the two viewers may write' using errcode='42501'; end if;
  if tg_op='DELETE' then raise exception 'Deleting movies is forbidden' using errcode='42501'; end if;
  mine := case when actor='elevely' then 'user_ratings' else 'girlfriend_ratings' end;
  other := case when actor='elevely' then 'girlfriend_ratings' else 'user_ratings' end;
  note_key := case when actor='elevely' then 'user_notes' else 'girlfriend_notes' end;
  total_key := case when actor='elevely' then 'user_total' else 'girlfriend_total' end;
  if length(coalesce(to_jsonb(new)->>note_key,''))>10000 then raise exception 'Note too long'; end if;
  if tg_op='INSERT' then
    if to_jsonb(new)->other is distinct from 'null'::jsonb
      or coalesce(to_jsonb(new)->>case when actor='elevely' then 'girlfriend_notes' else 'user_notes' end,'')<>''
      then raise exception 'Cannot create the other viewer review' using errcode='42501'; end if;
    if to_jsonb(new)->mine is not distinct from 'null'::jsonb then raise exception 'Own ratings required'; end if;
    -- Serialize additions, including manual entries. Existing duplicate legacy rows are left untouched.
    perform pg_advisory_xact_lock(739160028);
    film := to_jsonb(new.movie_data);
    select m.id into locked_id from public.movies m where m.id<>new.id and (
      (coalesce(film->>'kinopoiskId',film->>'filmId','')<>'' and
        coalesce(to_jsonb(m.movie_data)->>'kinopoiskId',to_jsonb(m.movie_data)->>'filmId','')=coalesce(film->>'kinopoiskId',film->>'filmId'))
      or (lower(regexp_replace(btrim(coalesce(to_jsonb(m.movie_data)->>'nameRu',to_jsonb(m.movie_data)->>'nameEn',to_jsonb(m.movie_data)->>'nameOriginal','')),'\s+',' ','g'))=
          lower(regexp_replace(btrim(coalesce(film->>'nameRu',film->>'nameEn',film->>'nameOriginal','')),'\s+',' ','g'))
        and coalesce(to_jsonb(m.movie_data)->>'year','')=coalesce(film->>'year',''))
    ) limit 1;
    if locked_id is not null then raise exception 'Film already exists' using errcode='23505'; end if;
    ratings_changed := true;
  else
    if (to_jsonb(new)-array[mine,note_key,total_key,'final_rating','has_spoilers']) is distinct from
       (to_jsonb(old)-array[mine,note_key,total_key,'final_rating','has_spoilers']) then
       raise exception 'Cannot change partner review or movie metadata' using errcode='42501';
    end if;
    ratings_changed := to_jsonb(new)->mine is distinct from to_jsonb(old)->mine;
    if not ratings_changed and (to_jsonb(new)->total_key is distinct from to_jsonb(old)->total_key or new.final_rating is distinct from old.final_rating) then
      raise exception 'Cannot forge totals' using errcode='42501';
    end if;
  end if;
  if ratings_changed then
    if to_jsonb(new)->mine is not distinct from 'null'::jsonb then raise exception 'Own ratings required'; end if;
    a:=public.films_raw_score(to_jsonb(new.user_ratings)); b:=public.films_raw_score(to_jsonb(new.girlfriend_ratings));
    if actor='elevely' or tg_op='INSERT' then new.user_total:=floor(a+0.5); end if;
    if actor='mashka' or tg_op='INSERT' then new.girlfriend_total:=floor(b+0.5); end if;
    new.final_rating:=floor((a+b)/2+0.5);
  end if;
  return new;
end $$;

-- SECURITY INVOKER: PostgreSQL column grants, RLS and the trigger remain authoritative.
create or replace function public.films_update_review(film_id bigint, previous_row jsonb, changes jsonb)
returns setof public.movies language plpgsql security invoker set search_path='' as $$
declare current_row public.movies; next_row public.movies; allowed text[];
begin
  allowed:=case public.films_actor() when 'elevely' then array['user_ratings','user_notes','user_total','final_rating','has_spoilers']
    when 'mashka' then array['girlfriend_ratings','girlfriend_notes','girlfriend_total','final_rating','has_spoilers'] else array[]::text[] end;
  if jsonb_typeof(changes)<>'object' or changes-allowed<>'{}'::jsonb or public.films_actor() is null then
    raise exception 'Invalid review fields' using errcode='42501';
  end if;
  select * into current_row from public.movies where id=film_id for update;
  if not found or to_jsonb(current_row) is distinct from previous_row then return; end if;
  select * into next_row from jsonb_populate_record(null::public.movies,to_jsonb(current_row)||changes);
  if public.films_actor()='elevely' then
    return query update public.movies set user_ratings=next_row.user_ratings,user_notes=next_row.user_notes,
      user_total=next_row.user_total,final_rating=next_row.final_rating,has_spoilers=next_row.has_spoilers where id=film_id returning *;
  else
    return query update public.movies set girlfriend_ratings=next_row.girlfriend_ratings,girlfriend_notes=next_row.girlfriend_notes,
      girlfriend_total=next_row.girlfriend_total,final_rating=next_row.final_rating,has_spoilers=next_row.has_spoilers where id=film_id returning *;
  end if;
end $$;

-- Explicitly replace write policies only after reviewing the audit. Read policies stay unchanged.
-- A restrictive policy also limits any pre-existing permissive policies to the two owners.
alter table public.movies enable row level security;
create policy films_owners_only on public.movies as restrictive for all to authenticated
  using(public.films_actor() is not null) with check(public.films_actor() is not null);
create policy films_owner_insert on public.movies for insert to authenticated with check(public.films_actor() is not null);
create policy films_owner_update on public.movies for update to authenticated using(public.films_actor() is not null) with check(public.films_actor() is not null);
create policy films_owner_read on public.movies for select to authenticated using(public.films_actor() is not null);
revoke insert, update, delete, truncate, references, trigger on public.movies from public, anon, authenticated;
-- Remove inherited column grants as well; table REVOKE alone is insufficient.
do $$ declare c record; begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='movies' loop
    execute format('revoke insert (%I), update (%I), references (%I) on public.movies from public, anon, authenticated',c.column_name,c.column_name,c.column_name);
  end loop;
end $$;
grant select on public.movies to authenticated;
grant insert(id,movie_data,user_ratings,girlfriend_ratings,user_total,girlfriend_total,final_rating,date_added,user_notes,girlfriend_notes,has_spoilers) on public.movies to authenticated;
grant update(user_ratings,girlfriend_ratings,user_total,girlfriend_total,final_rating,user_notes,girlfriend_notes,has_spoilers) on public.movies to authenticated;
create trigger films_review_guard before insert or update or delete on public.movies for each row execute function public.films_guard_review();
revoke all on function public.films_actor(), public.films_raw_score(jsonb), public.films_guard_review(), public.films_update_review(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.films_actor(), public.films_raw_score(jsonb), public.films_guard_review(), public.films_update_review(bigint,jsonb,jsonb) to authenticated;
commit;
