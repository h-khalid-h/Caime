-- contracts after c1076d0ff6916f1c9d15b1a26e6f01e80713c32f
-- An app's webhook secrets are kept sealed alone (M16 G1c): the clear copies the releases before G1
-- kept were emptied by 0134, and since c1076d0 nothing reads or writes them.
alter table org_apps drop column if exists webhook_secret;
alter table org_apps drop column if exists previous_webhook_secret;
