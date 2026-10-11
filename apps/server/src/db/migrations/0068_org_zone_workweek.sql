-- An organization's own time zone and days worked (PRODUCT-REVIEW R76): null takes its
-- country's (core countries.ts, the country's main zone), as every organization did until now;
-- its owner or admins set them on the setup screen.
alter table organizations add column time_zone text;
alter table organizations add column workweek smallint[];
