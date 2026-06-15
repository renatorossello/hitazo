import { NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getProgress } from "@/lib/deck-engine";

/**
 * GET /api/admin/resolve/progress
 * Conteos por year_status para la barra de progreso. Host-only.
 */
export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const supabase = createServiceClient();
  const progress = await getProgress(supabase);
  return NextResponse.json(progress);
}
