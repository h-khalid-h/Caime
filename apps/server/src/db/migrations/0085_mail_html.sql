-- R75 phase 2: a mail's HTML as it was sent, shown in a sandbox; cleared with the message.
alter table mail_messages add column html text;
