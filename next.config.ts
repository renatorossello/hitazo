import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify exige 127.0.0.1 (loopback IP) para el redirect OAuth en dev, así que
  // accedemos a la app por 127.0.0.1. Next 16 bloquea por defecto los recursos de
  // dev (HMR, chunks de cliente, fuentes) cuando el host no es el de arranque
  // (localhost) → el cliente no hidrata. Habilitamos 127.0.0.1 explícitamente.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
