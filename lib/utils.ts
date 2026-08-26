/**
 * Class-name joiner. The shadcn convention is `cn` from `@/lib/utils`, so
 * registry components dropped into this project find what they expect.
 *
 * This project styles with plain CSS rather than Tailwind, so there is no
 * tailwind-merge step to do: joining and dropping empties is the whole job.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
