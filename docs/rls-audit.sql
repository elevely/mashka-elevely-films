-- Read-only inspection in the owner's SQL editor. This never reads the notes themselves.
begin transaction read only;
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as forced
from pg_class c where c.oid='public.movies'::regclass;
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='movies' order by ordinal_position;
select policyname, permissive, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='movies';
select r, p, has_table_privilege(r,'public.movies',p) as allowed
from unnest(array['anon','authenticated']) r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p;
select grantee, column_name, privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='movies' and grantee in ('anon','authenticated','PUBLIC')
order by grantee, privilege_type,column_name;
select constraint_name,constraint_type from information_schema.table_constraints
where table_schema='public' and table_name='movies';
commit;

-- Additional read-only inventory: constraints, defaults, functions, existing triggers and row count.
begin transaction read only;
select count(*) as expected_movie_count from public.movies;
select column_name, column_default from information_schema.columns where table_schema='public' and table_name='movies';
select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.movies'::regclass;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid='public.movies'::regclass and not tgisinternal;
select n.nspname,p.proname,p.prosecdef as security_definer,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and (p.prosecdef or p.proname like 'films_%');
commit;
