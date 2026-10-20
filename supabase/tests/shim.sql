-- Simula o mínimo do Supabase para testar as migrações num Postgres local.
do $$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
