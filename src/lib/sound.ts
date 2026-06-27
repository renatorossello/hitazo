/**
 * Aviso sonoro para el modo manual (sin API). Lo dispara el celu del jugador EN TURNO
 * al cerrar la ronda: como está en primer plano (con gesto del usuario), el audio sí
 * suena, y el host —que tiene el celu boca abajo escuchando en Spotify— se entera de
 * que puede dar vuelta el celu y marcar Adivinó/No.
 *
 * Triple beep generado con Web Audio (sin assets), agudo para cortar sobre la música.
 */
export function playEndTurnCue() {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (startOffset: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      const t = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    };
    beep(0, 988);
    beep(0.22, 988);
    beep(0.44, 1319);
    // cierra el contexto cuando termina (no dejar audio colgado)
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* sin sonido si el navegador no deja */
  }
}
