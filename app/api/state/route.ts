import { NextResponse } from "next/server";
import { readState } from "@/lib/store";

/** What the client polls every ten seconds. Never cached, never stale. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
