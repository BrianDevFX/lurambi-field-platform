-- Read-only inventory. Run in the Supabase SQL editor against a local or TEST project.

-- Public table RLS state.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- Policies, including predicates and role coverage.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- RLS-enabled tables with no policy.
SELECT c.relname AS table_without_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname)
ORDER BY c.relname;

-- All table privileges for the app-facing roles.
SELECT grantee, table_schema, table_name, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
ORDER BY table_name, grantee, privilege_type;

-- Entries and audit log privileges, including grants inherited by PUBLIC.
SELECT grantee, table_schema, table_name, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name IN ('entries','audit_log')
ORDER BY table_name, grantee, privilege_type;

-- Triggers that guard append-only audit rows or run database-side validation.
SELECT event_object_table AS table_name, trigger_name, action_timing,
       event_manipulation, action_orientation, action_statement
FROM information_schema.triggers
WHERE trigger_schema='public' OR event_object_schema='auth'
ORDER BY event_object_schema, event_object_table, trigger_name;

-- Indexes for uniqueness, idempotency and matching.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public'
ORDER BY tablename, indexname;
