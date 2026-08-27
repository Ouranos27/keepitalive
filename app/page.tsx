import { LiveSite } from "@/components/LiveSite";
import { Memorial } from "@/components/Memorial";
import { readState } from "@/lib/store";

/**
 * There is no static version of this page. The clock is the page.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const state = await readState();
  if (state.alive) return <LiveSite initial={state} />;

  // Dead: pull the whole ledger. It cannot grow again, so this read is final.
  const final = await readState({ full: true });
  return <Memorial state={final} />;
}
