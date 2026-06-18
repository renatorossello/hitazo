import { describe, it, expect } from "vitest";
import { songKey } from "./deck";

describe("songKey (identidad de canción para no repetir tema en una partida)", () => {
  it("colapsa el mismo tema escrito distinto", () => {
    // El caso real: la misma canción entra por dos cartas (otra playlist / otro URI).
    expect(songKey({ title: "Terminales", artist: "Cruzando El Charco" })).toBe(
      songKey({ title: "Terminales", artist: "Cruzando El Charco" })
    );
  });

  it("ignora sufijos de remaster/live/mono", () => {
    const orig = songKey({ title: "Hotel California", artist: "Eagles" });
    expect(songKey({ title: "Hotel California - 2013 Remaster", artist: "Eagles" })).toBe(orig);
    expect(songKey({ title: "Bohemian Rhapsody - Remastered 2011", artist: "Queen" })).toBe(
      songKey({ title: "Bohemian Rhapsody", artist: "Queen" })
    );
  });

  it("ignora paréntesis y feats", () => {
    expect(songKey({ title: "Uptown Funk (feat. Bruno Mars)", artist: "Mark Ronson, Bruno Mars" })).toBe(
      songKey({ title: "Uptown Funk", artist: "Mark Ronson" })
    );
  });

  it("ignora acentos y mayúsculas", () => {
    expect(songKey({ title: "Canción", artist: "Él" })).toBe(
      songKey({ title: "cancion", artist: "el" })
    );
  });

  it("usa solo el primer artista", () => {
    expect(songKey({ title: "Despacito", artist: "Luis Fonsi, Daddy Yankee" })).toBe(
      songKey({ title: "Despacito", artist: "Luis Fonsi" })
    );
  });

  it("no colapsa canciones realmente distintas", () => {
    expect(songKey({ title: "Creep", artist: "Radiohead" })).not.toBe(
      songKey({ title: "Karma Police", artist: "Radiohead" })
    );
  });
});
