import type { z } from 'zod';
import { errors } from './errors';

// Checks a request body against its shared rule. Unknown fields are removed.
export function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join('.') || '_'] = issue.message;
    }
    throw errors.validation({ fields });
  }
  return result.data;
}
