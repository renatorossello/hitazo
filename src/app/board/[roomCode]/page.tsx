import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import BoardClient from "@/components/BoardClient";

/**
 * Board de una partida. Server component: valida que la sala exista y decide si
 * quien mira es el host (cookie de Spotify). Lo vivo (lobby/juego + realtime) lo
 * maneja BoardClient.
 */
export default async function BoardPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode: raw } = await params;
  const roomCode = raw.toUpperCase();

  const supabase = createServiceClient();
  const { data: game } = await supabase
    .from("ct_games")
    .select("id")
    .eq("room_code", roomCode)
    .single();
  if (!game) notFound();

  const isHost = await isHostAuthenticated();

  return <BoardClient roomCode={roomCode} isHost={isHost} />;
}
