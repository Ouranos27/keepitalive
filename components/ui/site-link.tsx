import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/**
 * A link to somebody's site.
 *
 * Every outbound link on this page is a thing somebody paid for, and every one
 * of them has to carry sponsored and nofollow. Putting that in one component
 * rather than repeating the rel string at each call site means there is exactly
 * one place to get it wrong.
 *
 * The arrow is the affordance. An underline says "link"; it does not say the
 * link leaves the page, and leaving the page is what these people are buying.
 */
export function SiteLink({
  href,
  className,
  icon = true,
  children,
}: {
  href: string;
  className?: string;
  /** Off inside running prose, where an arrow mid-sentence is just clutter. */
  icon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      className={cn("outlink", className)}
      href={href}
      rel="sponsored nofollow noopener"
      target="_blank"
    >
      {children}
      {icon ? <ArrowUpRight className="outlink__icon" weight="bold" aria-hidden="true" /> : null}
    </a>
  );
}
