"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Board de prueba — Fase 1.
 * Inicializa el Web Playback SDK con el token del host y reproduce una carta de
 * prueba por URI, con controles play/pausa/replay. Objetivo: validar que el audio
 * SUENA en el navegador del host antes de construir la sala.
 *
 * Track de prueba por defecto: "Never Gonna Give You Up" (cambialo si querés).
 */
const DEFAULT_URI = "spotify:track:4PTG3Z6ehGkBFwjybzWkR8";

type Status = "loading" | "no_session" | "ready" | "error";

export default function BoardTestPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("Cargando el SDK de Spotify…");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [trackUri, setTrackUri] = useState(DEFAULT_URI);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);

  const playerRef = useRef<SpotifyPlayer | null>(null);

  /** Pide un access_token fresco del host. Si no hay sesión, lo manda a loguearse. */
  const fetchAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/spotify/token");
      if (res.status === 401) {
        setStatus("no_session");
        setMessage("No hay sesión de Spotify. Conectate como host primero.");
        return null;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage(`Error pidiendo token (${res.status}).`);
        return null;
      }
      const data = (await res.json()) as { access_token: string };
      return data.access_token;
    } catch (e) {
      setStatus("error");
      setMessage(`No se pudo pedir el token: ${String(e)}`);
      return null;
    }
  }, []);

  // Inicializa el SDK una sola vez.
  useEffect(() => {
    let cancelled = false;

    function initPlayer() {
      console.log("[board] onSpotifyWebPlaybackSDKReady → initPlayer");
      if (cancelled || !window.Spotify) return;

      const player = new window.Spotify.Player({
        name: "Hitazo Board",
        volume: 0.8,
        getOAuthToken: (cb) => {
          console.log("[board] getOAuthToken: pidiendo token al server…");
          fetchAccessToken().then((token) => {
            if (token) {
              console.log("[board] token OK, se lo paso al SDK");
              cb(token);
            } else {
              console.warn("[board] sin token: el SDK no va a conectar");
            }
          });
        },
      });
      playerRef.current = player;

      player.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setStatus("ready");
        setMessage("Listo. El board es un dispositivo de reproducción.");
      });

      player.addListener("not_ready", () => {
        setMessage("El dispositivo quedó offline.");
      });

      player.addListener("authentication_error", ({ message }) => {
        setStatus("no_session");
        setMessage(`Error de autenticación: ${message}. Reconectá el host.`);
      });
      player.addListener("account_error", ({ message }) => {
        setStatus("error");
        setMessage(`Error de cuenta (¿no es Premium?): ${message}`);
      });
      player.addListener("initialization_error", ({ message }) => {
        setStatus("error");
        setMessage(`No se pudo inicializar el SDK: ${message}`);
      });
      player.addListener("playback_error", ({ message }) => {
        setMessage(`Error de reproducción: ${message}`);
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setIsPaused(state.paused);
        const t = state.track_window.current_track;
        setNowPlaying(t ? `${t.name} — ${t.artists.map((a) => a.name).join(", ")}` : null);
      });

      player.connect();
    }

    // Si el SDK ya cargó, inicializamos; si no, esperamos su callback global.
    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      const existing = document.getElementById("spotify-sdk");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "spotify-sdk";
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        script.onerror = () => {
          setStatus("error");
          setMessage(
            "No se pudo cargar el SDK de Spotify (sdk.scdn.co). Suele ser un ad-blocker/bloqueador de rastreadores: desactivalo para este sitio y recargá."
          );
        };
        document.body.appendChild(script);
      }
    }

    // Watchdog: si en 10s el SDK no quedó listo, avisamos en vez de quedar colgados.
    const watchdog = setTimeout(() => {
      if (!cancelled && !window.Spotify) {
        setMessage(
          "El SDK de Spotify no respondió. Revisá la consola (F12) y descartá un ad-blocker bloqueando sdk.scdn.co."
        );
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      playerRef.current?.disconnect();
    };
  }, [fetchAccessToken]);

  /** Arranca un track por URI en el device del SDK (Web API). */
  const playTrack = useCallback(async () => {
    if (!deviceId) return;
    const token = await fetchAccessToken();
    if (!token) return;
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [trackUri] }),
      }
    );
    if (!res.ok && res.status !== 204) {
      setMessage(`No se pudo reproducir (${res.status}): ${await res.text()}`);
    }
  }, [deviceId, trackUri, fetchAccessToken]);

  const togglePlay = useCallback(async () => {
    await playerRef.current?.[isPaused ? "resume" : "pause"]();
  }, [isPaused]);

  const replay = useCallback(async () => {
    await playerRef.current?.seek(0);
    await playerRef.current?.resume();
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Board — prueba de audio</h1>

      <p
        className={`max-w-md rounded-md px-4 py-2 text-sm ${
          status === "ready"
            ? "bg-green-100 text-green-700"
            : status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-600"
        }`}
      >
        {message}
      </p>

      {status === "no_session" && (
        <a href="/host" className="rounded-full bg-black px-6 py-3 font-semibold text-white">
          Conectar host
        </a>
      )}

      {status === "ready" && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <input
            value={trackUri}
            onChange={(e) => setTrackUri(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-center text-sm"
            placeholder="spotify:track:…"
          />
          <div className="flex gap-3">
            <button
              onClick={playTrack}
              className="rounded-full bg-[#1DB954] px-5 py-2 font-semibold text-white hover:bg-[#1ed760]"
            >
              Reproducir carta
            </button>
            <button onClick={togglePlay} className="rounded-full border px-5 py-2 font-semibold">
              {isPaused ? "Play" : "Pausa"}
            </button>
            <button onClick={replay} className="rounded-full border px-5 py-2 font-semibold">
              Replay
            </button>
          </div>
          {nowPlaying && <p className="text-sm text-gray-500">Sonando: {nowPlaying}</p>}
        </div>
      )}
    </main>
  );
}
