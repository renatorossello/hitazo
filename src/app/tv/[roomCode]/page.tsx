import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import TvView from "@/components/TvView";

/**
 * /tv/:roomCode — vista para la TELE (apaisada, grande). Es la vista pública del
 * juego optimizada para un smart TV con navegador. Solo lectura, sin audio.
 */
export default async function TvPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode: raw } = await params;
  const roomCode = raw.toUpperCase();

  const supabase = createServiceClient();
  const { data: game } = await supabase.from("ct_games").select("id").eq("room_code", roomCode).single();
  if (!game) notFound();

  return <TvView roomCode={roomCode} />;
}
