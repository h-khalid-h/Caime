-- Where someone came from (PRD §82): the @handle link that brought them, a person's or an
-- organization's. Counted in aggregate for the operator; nobody is told.
alter table users add column invited_by uuid references users (id) on delete set null;
alter table users add column invited_by_org uuid references organizations (id) on delete set null;
