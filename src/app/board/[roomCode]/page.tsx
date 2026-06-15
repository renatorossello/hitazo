import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import Lobby from "@/components/Lobby";

/**
 * Board / lobby de una partida. Server component: valida que la sala exista, trae
 * los equipos persistidos y decide si quien mira es el host (cookie de Spotify).
 * La parte viva (QR + presencia realtime) la maneja <Lobby> en el cliente.
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
    .select("id, room_code, status")
    .eq("room_code", roomCode)
    .single();

  if (!game) notFound();

  const { data: teams } = await supabase
    .from("ct_teams")
    .select("id, name, join_order")
    .eq("game_id", game.id)
    .order("join_order", { ascending: true });

  const isHost = await isHostAuthenticated();

  return (
    <Lobby
      roomCode={game.room_code}
      status={game.status}
      isHost={isHost}
      initialTeams={(teams ?? []).map((t) => ({
        teamId: t.id,
        name: t.name,
        joinOrder: t.join_order,
      }))}
    />
  );
}
