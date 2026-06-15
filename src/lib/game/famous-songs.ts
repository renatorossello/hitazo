/**
 * Seed inicial: 50 canciones muy famosas, repartidas por década para que el juego
 * de línea de tiempo tenga buen spread. Es un PRIMER set provisorio (a definir).
 *
 * El `year` es solo de referencia (el año real de juego lo resuelve MusicBrainz vía
 * ISRC). Sirve como fallback manual si MB no resuelve alguna.
 */
export type FamousSong = { title: string; artist: string; year: number };

export const FAMOUS_SONGS: FamousSong[] = [
  // 60s
  { title: "Hey Jude", artist: "The Beatles", year: 1968 },
  { title: "(I Can't Get No) Satisfaction", artist: "The Rolling Stones", year: 1965 },
  { title: "Good Vibrations", artist: "The Beach Boys", year: 1966 },
  { title: "Respect", artist: "Aretha Franklin", year: 1967 },
  { title: "Purple Haze", artist: "Jimi Hendrix", year: 1967 },
  // 70s
  { title: "Bohemian Rhapsody", artist: "Queen", year: 1975 },
  { title: "Stairway to Heaven", artist: "Led Zeppelin", year: 1971 },
  { title: "Hotel California", artist: "Eagles", year: 1976 },
  { title: "Dancing Queen", artist: "ABBA", year: 1976 },
  { title: "Stayin' Alive", artist: "Bee Gees", year: 1977 },
  { title: "Heroes", artist: "David Bowie", year: 1977 },
  { title: "No Woman No Cry", artist: "Bob Marley & The Wailers", year: 1975 },
  { title: "Go Your Own Way", artist: "Fleetwood Mac", year: 1977 },
  // 80s
  { title: "Billie Jean", artist: "Michael Jackson", year: 1982 },
  { title: "Like a Prayer", artist: "Madonna", year: 1989 },
  { title: "Purple Rain", artist: "Prince", year: 1984 },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses", year: 1987 },
  { title: "I Wanna Dance with Somebody", artist: "Whitney Houston", year: 1987 },
  { title: "Take On Me", artist: "a-ha", year: 1985 },
  { title: "Livin' on a Prayer", artist: "Bon Jovi", year: 1986 },
  { title: "With or Without You", artist: "U2", year: 1987 },
  { title: "Every Breath You Take", artist: "The Police", year: 1983 },
  { title: "Don't Stop Believin'", artist: "Journey", year: 1981 },
  { title: "Girls Just Want to Have Fun", artist: "Cyndi Lauper", year: 1983 },
  // 90s
  { title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
  { title: "I Will Always Love You", artist: "Whitney Houston", year: 1992 },
  { title: "Wonderwall", artist: "Oasis", year: 1995 },
  { title: "Creep", artist: "Radiohead", year: 1992 },
  { title: "...Baby One More Time", artist: "Britney Spears", year: 1998 },
  { title: "Wannabe", artist: "Spice Girls", year: 1996 },
  { title: "I Want It That Way", artist: "Backstreet Boys", year: 1999 },
  { title: "No Scrubs", artist: "TLC", year: 1999 },
  { title: "Losing My Religion", artist: "R.E.M.", year: 1991 },
  { title: "My Heart Will Go On", artist: "Céline Dion", year: 1997 },
  // 2000s
  { title: "Yellow", artist: "Coldplay", year: 2000 },
  { title: "Lose Yourself", artist: "Eminem", year: 2002 },
  { title: "Crazy in Love", artist: "Beyoncé", year: 2003 },
  { title: "Hey Ya!", artist: "OutKast", year: 2003 },
  { title: "Mr. Brightside", artist: "The Killers", year: 2004 },
  { title: "Crazy", artist: "Gnarls Barkley", year: 2006 },
  { title: "Rehab", artist: "Amy Winehouse", year: 2006 },
  { title: "Umbrella", artist: "Rihanna", year: 2007 },
  { title: "Poker Face", artist: "Lady Gaga", year: 2008 },
  // 2010s
  { title: "Rolling in the Deep", artist: "Adele", year: 2010 },
  { title: "Get Lucky", artist: "Daft Punk", year: 2013 },
  { title: "Happy", artist: "Pharrell Williams", year: 2013 },
  { title: "Uptown Funk", artist: "Mark Ronson", year: 2014 },
  { title: "Shape of You", artist: "Ed Sheeran", year: 2017 },
  { title: "Despacito", artist: "Luis Fonsi", year: 2017 },
  { title: "Blinding Lights", artist: "The Weeknd", year: 2019 },
];
