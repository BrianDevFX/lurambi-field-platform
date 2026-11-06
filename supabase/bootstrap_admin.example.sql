-- Create the first account through Supabase Auth, then run this in the SQL editor.
-- Replace the placeholder with that account's email. Do not commit a populated file.
UPDATE public.profiles
SET role = 'admin', status = 'approved', approved_at = now(), updated_at = now()
WHERE email = '<FIRST_ADMIN_EMAIL>';

-- Confirm exactly one row was changed before continuing.
-- The app cannot promote its own first administrator.
