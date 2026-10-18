-- Which key sealed a connection's refresh token (M16 B5): null is the database's own key
-- (`accounts.vault` in server_settings, as every one was sealed before), else the id of the
-- environment's VAULT_KEY that sealed it (`vaultKid`). Values move to the key that seals now as
-- they're used and by the `vault.reseal` pass.
alter table connected_accounts add column refresh_kid text;
