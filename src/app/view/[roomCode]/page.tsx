import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import SpectatorView from "@/components/SpectatorView";

/**
 * /view/:roomCode — vista pública de solo lectura de la partida (líneas de tiempo
 * de todos los equipos). No requiere ser host ni jugador.
 */
export default async function ViewPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode: raw } = await params;
  const roomCode = raw.toUpperCase();

  const supabase = createServiceClient();
  const { data: game } = await supabase.from("ct_games").select("id").eq("room_code", roomCode).single();
  if (!game) notFound();

  return <SpectatorView roomCode={roomCode} />;
}
