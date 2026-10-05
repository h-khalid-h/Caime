import { tr } from '@caime/core/i18n';
import type { z } from 'zod';
import { badRequest } from './errors';

/** Parse input with a zod schema, turning failures into a 400 with field-level details. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    // A schema's own words (`msg('…')` in core) in the request's language; zod's own stay as
    // they are (a developer's, never a form's: the app checks fields before it sends).
    const fields = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: tr(i.message),
    }));
    const first = fields[0];
    throw badRequest(
      first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : tr('Invalid request.'),
      { fields },
    );
  }
  return result.data;
}
