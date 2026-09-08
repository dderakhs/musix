-- musix: address Supabase security linter findings from 0001/0002.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- handle_new_user is only ever invoked by the auth.users trigger; it must not
-- be reachable through the PostgREST rpc surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
