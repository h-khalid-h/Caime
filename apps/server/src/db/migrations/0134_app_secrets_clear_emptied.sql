-- The clear copies of apps' webhook secrets emptied (M16 G1b): the release before sealed every one
-- beside its copy (0130, its vault pass), and this release reads and writes the sealed ones alone.
-- A copy is emptied only where its sealed one is kept; the columns go in a later release.
update org_apps set webhook_secret = null
  where webhook_secret is not null and webhook_secret_sealed is not null;
update org_apps set previous_webhook_secret = null
  where previous_webhook_secret is not null and previous_secret_sealed is not null;
