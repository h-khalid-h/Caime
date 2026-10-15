-- R93: whether an address ever exchanged mail with Caime is asked once per first mail to it.
create index mail_messages_to_address on mail_messages (to_address);
create index mail_messages_from_address on mail_messages (from_address);
