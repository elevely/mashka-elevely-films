-- Review on staging first. Installing this function in production requires owner approval.
-- Requires public.movies.id bigint (or another bigint-compatible integer) and the legacy note columns.
begin;
create function public.films_update_notes(
  film_id bigint, previous_e text, previous_m text, previous_spoilers boolean,
  next_e text, next_m text, next_spoilers boolean
) returns setof public.movies language sql security invoker set search_path = '' as $$
  update public.movies as m
  set user_notes = next_e, girlfriend_notes = next_m, has_spoilers = next_spoilers
  where m.id = film_id
    and m.user_notes is not distinct from previous_e
    and m.girlfriend_notes is not distinct from previous_m
    and m.has_spoilers is not distinct from previous_spoilers
  returning m.*;
$$;
revoke all on function public.films_update_notes(bigint,text,text,boolean,text,text,boolean) from public, anon;
grant execute on function public.films_update_notes(bigint,text,text,boolean,text,text,boolean) to authenticated;
commit;
