"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook del Web Playback SDK para el board (host). Inicializa el player con el token
 * del host y expone controles. `play(uri)` arranca un track por URI en este device.
 */
export type PlayerStatus = "loading" | "no_session" | "ready" | "error";

export function useSpotifyPlayer({ enabled = true }: { enabled?: boolean } = {}) {
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [message, setMessage] = useState("Cargando el SDK de Spotify…");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const playerRef = useRef<SpotifyPlayer | null>(null);

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

  useEffect(() => {
    if (!enabled) return; // modo manual: no inicializamos el SDK ni pedimos token
    let cancelled = false;

    function initPlayer() {
      if (cancelled || !window.Spotify) return;
      const player = new window.Spotify.Player({
        name: "Hitazo Board",
        volume: 0.8,
        getOAuthToken: (cb) => {
          fetchAccessToken().then((token) => {
            if (token) cb(token);
          });
        },
      });
      playerRef.current = player;

      player.addListener("ready", ({ device_id }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setStatus("ready");
        setMessage("");
      });
      player.addListener("not_ready", () => setMessage("El dispositivo quedó offline."));
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
      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setIsPaused(state.paused);
      });

      player.connect();
    }

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      if (!document.getElementById("spotify-sdk")) {
        const script = document.createElement("script");
        script.id = "spotify-sdk";
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        script.onerror = () => {
          setStatus("error");
          setMessage("No se pudo cargar el SDK de Spotify (¿ad-blocker?). Desactivalo y recargá.");
        };
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
    };
  }, [fetchAccessToken, enabled]);

  const play = useCallback(
    async (uri: string) => {
      if (!deviceId) return;
      // Desbloquea el elemento de audio (necesario para que el PRIMER play arranque
      // sin tener que tocar Play; los navegadores exigen un gesto del usuario).
      await playerRef.current?.activateElement?.();
      const token = await fetchAccessToken();
      if (!token) return;

      // position_ms: 0 → SIEMPRE desde el principio (evita seguir el tema anterior
      // desde donde quedó pausado al cerrar la ronda).
      const doPlay = () =>
        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uris: [uri], position_ms: 0 }),
        });

      let res = await doPlay();
      // Entre rondas el device del SDK puede quedar inactivo → Spotify devuelve 404
      // "Device not found". Lo reactivamos (transfer) y reintentamos, así no termina
      // resumiendo la canción anterior en vez de arrancar la nueva.
      if (res.status === 404) {
        await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [deviceId], play: false }),
        });
        await new Promise((r) => setTimeout(r, 400));
        res = await doPlay();
      }
      if (!res.ok && res.status !== 204) {
        setMessage(`No se pudo reproducir (${res.status}).`);
      }
    },
    [deviceId, fetchAccessToken]
  );

  // Desbloquea el <audio> del SDK DENTRO del gesto del usuario (sincrónico). Hay que
  // llamarlo apenas se toca el botón, ANTES de cualquier await, o el primer play de
  // la sesión queda sin sonido (los navegadores exigen el unlock dentro del gesto).
  const activate = useCallback(() => {
    void playerRef.current?.activateElement?.();
  }, []);

  const togglePlay = useCallback(async () => {
    await playerRef.current?.[isPaused ? "resume" : "pause"]();
  }, [isPaused]);

  const pause = useCallback(async () => {
    if (!isPaused) await playerRef.current?.pause();
  }, [isPaused]);

  const replay = useCallback(async () => {
    await playerRef.current?.seek(0);
    await playerRef.current?.resume();
  }, []);

  return { status, message, deviceId, isPaused, activate, play, togglePlay, pause, replay };
}
