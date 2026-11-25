-- Disposable database only: includes intentionally synthetic legacy data.
do $$ begin
 if current_database() !~ '^films_test(_[a-z0-9_]+)?$' then raise exception 'Disposable database required'; end if;
end $$;
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table public.movies (
 id bigint primary key,movie_data jsonb,user_ratings jsonb,girlfriend_ratings jsonb,
 user_total numeric,girlfriend_total numeric,final_rating numeric,date_added timestamptz,
 user_notes text,girlfriend_notes text,has_spoilers boolean,legacy_metadata jsonb
);
insert into public.movies values
 (101,'{"nameRu":"Legacy fixture","year":2020}', '[8,7.5,9,8,8.5]','[9,8.5,8,9,9.5]',91,95,93,'2026-11-01T00:00:00Z','E legacy','M legacy',false,'{"keep":true}');
-- Prove that installation leaves every stored byte/value intact and removes broad old grants.
create table public.snapshot as select * from public.movies;
grant all on public.movies to anon,authenticated;
grant update(id) on public.movies to anon;
create policy old_broad on public.movies for all to authenticated using(true) with check(true);
-- INSTALL_OWNER_GUARDS

do $$ begin
 if exists((select * from public.movies except select * from public.snapshot) union all (select * from public.snapshot except select * from public.movies)) then raise exception 'Migration changed historical data'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$ declare before_row public.movies; saved public.movies; n integer; begin
 select * into before_row from public.movies where id=101;
 -- Notes-only saves preserve deliberately inconsistent historic totals.
 select * into saved from public.films_update_review(101,to_jsonb(before_row),'{"user_notes":"new E note"}');
 if saved.final_rating<>93 or saved.user_total<>91 or saved.girlfriend_notes<>'M legacy' or saved.date_added<>before_row.date_added or saved.legacy_metadata<>before_row.legacy_metadata then raise exception 'Legacy values changed'; end if;
 select count(*) into n from public.films_update_review(101,to_jsonb(before_row),'{"user_notes":"stale"}');
 if n<>0 then raise exception 'Stale write succeeded'; end if;
 -- Same ratings must not rewrite historic totals; new ratings must update this owner and the shared total only.
 update public.movies set user_ratings='[8,7.5,9,8,8.5]' where id=101;
 if (select user_total from public.movies where id=101)<>91 then raise exception 'Unchanged ratings recalculated'; end if;
 update public.movies set user_ratings='[10,10,10,10,10]' where id=101;
 select * into saved from public.movies where id=101;
 if saved.user_total<>100 or saved.girlfriend_total<>95 or saved.girlfriend_ratings<>before_row.girlfriend_ratings or saved.final_rating<>94 then raise exception 'Owner total mismatch'; end if;
 begin update public.movies set girlfriend_notes='attack' where id=101; raise exception 'Foreign note accepted'; exception when insufficient_privilege then null; end;
 begin update public.movies set girlfriend_ratings='[0,0,0,0,0]' where id=101; raise exception 'Foreign rating accepted'; exception when insufficient_privilege then null; end;
 begin update public.movies set final_rating=100 where id=101; raise exception 'Forged total accepted'; exception when insufficient_privilege then null; end;
 begin update public.movies set id=102 where id=101; raise exception 'ID accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.movies where id=101; raise exception 'Delete accepted'; exception when insufficient_privilege then null; end;
 begin update public.movies set user_ratings='[11,0,0,0,0]' where id=101; raise exception 'Invalid rating accepted'; exception when invalid_parameter_value then null; end;
end $$;
insert into public.movies (id,movie_data,user_ratings,girlfriend_ratings,user_total,girlfriend_total,final_rating,date_added,user_notes,girlfriend_notes,has_spoilers)
 values(202,'{"nameRu":"New fixture","year":2026,"kinopoiskId":999}','[8,8,8,8,8]',null,0,100,100,now(),'E own','',false);
do $$ declare r public.movies; begin
 select * into r from public.movies where id=202;
 if r.user_total<>80 or r.girlfriend_total is not null or r.final_rating is not null then raise exception 'Partial review calculation failed'; end if;
 begin insert into public.movies(id,movie_data,user_ratings) values(203,'{"nameRu":"different title","kinopoiskId":999}','[8,8,8,8,8]'); raise exception 'Duplicate ID accepted'; exception when unique_violation then null; end;
 begin insert into public.movies(id,movie_data,user_ratings) values(204,'{"nameRu":"  NEW   FIXTURE  ","year":2026}','[8,8,8,8,8]'); raise exception 'Manual duplicate accepted'; exception when unique_violation then null; end;
 begin insert into public.movies(id,movie_data,user_ratings,girlfriend_ratings) values(205,'{"nameRu":"bad"}','[8,8,8,8,8]','[9,9,9,9,9]'); raise exception 'Foreign insert accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ declare r public.movies; n integer; begin
 select * into r from public.movies where id=202;
 select count(*) into n from public.films_update_review(202,to_jsonb(r),'{"girlfriend_ratings":[10,10,10,10,10],"girlfriend_notes":"M own","girlfriend_total":100,"final_rating":90}');
 if n<>1 then raise exception 'Second reviewer failed'; end if;
 select * into r from public.movies where id=202;
 if r.final_rating<>90 or r.user_total<>80 or r.girlfriend_total<>100 or r.user_notes<>'E own' then raise exception 'Shared score failed'; end if;
 begin update public.movies set user_notes='attack' where id=202; raise exception 'M foreign note accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$ begin
 if (select count(*) from public.movies)<>0 then raise exception 'Restrictive policy failed'; end if;
 begin insert into public.movies(id,movie_data,girlfriend_ratings) values(999,'{"nameRu":"intruder"}','[0,0,0,0,0]'); raise exception 'Intruder insert accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
 if has_column_privilege(current_user,'public.movies','id','update') or has_table_privilege(current_user,'public.movies','insert') or has_function_privilege(current_user,'public.films_update_review(bigint,jsonb,jsonb)','execute') then raise exception 'Anonymous write access remains'; end if;
end $$;
reset role;
select 'PostgreSQL guards passed: migration integrity, both roles, RLS, grants, RPC CAS, legacy preservation, forged writes, duplicates, partial and shared scores.' as result;
