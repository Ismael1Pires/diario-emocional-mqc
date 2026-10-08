-- MANUAL ONLY. Preserve all users, ownership, audit and emotional data.
-- Stop login/traffic before executing; otherwise new sessions may be created.
UPDATE auth_sessions SET expires_at = 0;
UPDATE auth_challenges SET consumed = 1;
-- Do not deploy the visitor-header version: it would expose historical records again.
-- Leave the additive schema in place. A schema downgrade after accounts have been
-- created would discard identities/ownership; it is intentionally not provided.
