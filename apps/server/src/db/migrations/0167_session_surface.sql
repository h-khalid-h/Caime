-- Where someone uses Caime (R120): a browser's tab, the web app installed from it, the desktop
-- app, or a phone's app, said by the app once a launch and kept on its session, which product
-- metrics count the week's people by. Null for a session from before it was said.
alter table sessions add column surface text;
