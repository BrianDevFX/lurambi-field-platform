-- Run once in the Supabase SQL editor after migrations. Replace each placeholder
-- with a separately generated random secret of at least 32 characters. Never commit
-- the populated statement or put either value in an environment file.
INSERT INTO private.app_secrets(name, value)
VALUES
  ('id_hmac_secret', '<INSERT_RANDOM_HMAC_SECRET_HERE>'),
  ('id_encryption_key', '<INSERT_RANDOM_ENCRYPTION_KEY_HERE>')
ON CONFLICT (name) DO NOTHING;
