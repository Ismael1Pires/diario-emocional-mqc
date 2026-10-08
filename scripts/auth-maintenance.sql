-- MANUAL / reviewed scheduled maintenance, AUTH TABLES ONLY.
-- No diary, user identity, ownership or migration audit data is removed.
DELETE FROM auth_sessions WHERE expires_at < unixepoch() - 86400;
DELETE FROM auth_challenges WHERE expires_at < unixepoch() - 86400;
DELETE FROM auth_limits WHERE window < unixepoch() - 172800;
