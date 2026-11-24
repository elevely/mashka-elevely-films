-- Disposable GitHub Actions database ONLY. Run with psql -v ON_ERROR_STOP=1.
create role anon;
create role authenticated;
create table public.movies (
  id bigint primary key, user_notes text, girlfriend_notes text, has_spoilers boolean,
  final_rating numeric, legacy_metadata jsonb
);
insert into public.movies values (101, null, 'старая заметка', false, 84.5, '{"keep":true}');
alter table public.movies enable row level security;
grant select on public.movies to authenticated;
grant update(user_notes,girlfriend_notes,has_spoilers) on public.movies to authenticated;
create policy fixture_read on public.movies for select to authenticated using(true);
create policy fixture_notes on public.movies for update to authenticated using(id=101) with check(id=101);
\ir ../docs/notes-function.sql
set role authenticated;
do $$
declare n integer; current_row public.movies;
begin
  select count(*) into n from public.films_update_notes(101,null,'старая заметка',false,'тест','новая заметка',true);
  if n<>1 then raise exception 'update failed'; end if;
  select count(*) into n from public.films_update_notes(101,null,'старая заметка',false,'stale','stale',false);
  if n<>0 then raise exception 'stale write succeeded'; end if;
  select * into current_row from public.movies where id=101;
  if current_row.user_notes<>'тест' or current_row.girlfriend_notes<>'новая заметка' or current_row.final_rating<>84.5 or current_row.legacy_metadata<>'{"keep":true}'::jsonb then
    raise exception 'data mismatch';
  end if;
  if has_column_privilege(current_user,'public.movies','final_rating','update') then raise exception 'excess update grant'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.films_update_notes(bigint,text,text,boolean,text,text,boolean)','execute') then raise exception 'anonymous function grant'; end if;
end $$;
