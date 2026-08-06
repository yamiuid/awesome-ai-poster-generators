alter function public.handle_new_user() set search_path = '';
alter function public.reserve_credits(uuid, uuid, integer) set search_path = '';
alter function public.settle_credits(uuid, integer, integer) set search_path = '';
alter function public.claim_guest_generation(text) set search_path = '';
alter function public.release_guest_generation(text) set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.settle_credits(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_guest_generation(text) from public, anon, authenticated;
revoke execute on function public.release_guest_generation(text) from public, anon, authenticated;

grant execute on function public.reserve_credits(uuid, uuid, integer) to service_role;
grant execute on function public.settle_credits(uuid, integer, integer) to service_role;
grant execute on function public.claim_guest_generation(text) to service_role;
grant execute on function public.release_guest_generation(text) to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
