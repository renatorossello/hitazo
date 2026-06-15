/**
 * Tipos mínimos del Spotify Web Playback SDK que usamos en el board.
 * El SDK se carga vía <script src="https://sdk.scdn.co/spotify-player.js">.
 */

interface SpotifyPlayerInit {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      uri: string;
      name: string;
      artists: { name: string }[];
    } | null;
  };
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: "ready" | "not_ready", cb: (data: { device_id: string }) => void): void;
  addListener(
    event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
    cb: (data: { message: string }) => void
  ): void;
  addListener(event: "player_state_changed", cb: (state: SpotifyPlayerState | null) => void): void;
  removeListener(event: string): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

interface SpotifyNamespace {
  Player: new (init: SpotifyPlayerInit) => SpotifyPlayer;
}

interface Window {
  Spotify?: SpotifyNamespace;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
