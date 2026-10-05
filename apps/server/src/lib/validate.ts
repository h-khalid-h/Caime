import { tr } from '@caime/core/i18n';
import type { z } from 'zod';
import { badRequest } from './errors';

/** Parse input with a zod schema, turning failures into a 400 with field-level details. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = fields[0];
    throw badRequest(
      first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : tr('Invalid request.'),
      { fields },
    );
  }
  return result.data;
}
