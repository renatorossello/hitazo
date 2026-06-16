import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { setManualYear } from "@/lib/deck-engine";

/**
 * PATCH /api/admin/cards/:id  { year?, region? }
 * Fija el año a mano (year_status = 'manual') y/o corrige la región/idioma.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    year?: number;
    region?: string;
    buckets?: string[];
  };
  const supabase = createServiceClient();

  try {
    if (body.year !== undefined) {
      const year = Number(body.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return NextResponse.json({ error: "invalid_year" }, { status: 400 });
      }
      await setManualYear(supabase, id, year);
    }
    if (typeof body.region === "string") {
      await supabase.from("ct_cards").update({ region: body.region.trim() || null }).eq("id", id);
    }
    if (Array.isArray(body.buckets)) {
      await supabase.from("ct_cards").update({ genre_buckets: body.buckets }).eq("id", id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/admin/cards/:id — descarta la carta. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from("ct_cards").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
