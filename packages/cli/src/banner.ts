import pc from "picocolors";

/**
 * The "partweave" wordmark: a small pixel banner whose glyphs are filled with a
 * two-tone weave (a █/▓ basket-weave checkerboard — a nod to the name) under a
 * violet→magenta→red gradient. Built entirely from strings (no deps) and degrades
 * on purpose so it "works on anything":
 *   - truecolor terminal  → smooth 24-bit gradient over the weave
 *   - basic color         → a magenta→red two-tone weave
 *   - NO_COLOR             → the weave texture alone (still legible & woven)
 *   - narrow / no TTY      → a one-line `partweave` fallback
 * The weave chars are Block Elements (U+2580–U+259F), the same range as █, so
 * they render wherever the solid block would.
 */

// Basket-weave fill: a █/▓ checkerboard keeps every cell filled (so letters stay
// crisp) while the alternating shades read as interlaced threads.
const WEAVE = ["█", "▓"] as const;
const weaveCell = (row: number, col: number): string => WEAVE[(row + col) % 2];

// 5-row glyphs. Every row of a glyph is the same width so columns line up when
// letters are joined with a single-space gutter.
const GLYPHS: Record<string, string[]> = {
  p: ["███ ", "█  █", "███ ", "█   ", "█   "],
  a: [" ██ ", "█  █", "████", "█  █", "█  █"],
  r: ["███ ", "█  █", "███ ", "█ █ ", "█  █"],
  t: ["█████", "  █  ", "  █  ", "  █  ", "  █  "],
  w: ["█   █", "█   █", "█ █ █", "██ ██", "█   █"],
  e: ["████", "█   ", "███ ", "█   ", "████"],
  v: ["█   █", "█   █", "█   █", " █ █ ", "  █  "],
};

const WORD = "partweave";
const HEIGHT = 5;

type Mode = "truecolor" | "basic" | "none";

function colorMode(): Mode {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return "none";
  if (/truecolor|24bit/i.test(process.env.COLORTERM ?? "")) return "truecolor";
  return "basic";
}

// Violet → magenta → pink → red → coral: warms from purple into several shades
// of red across the wordmark.
const STOPS: [number, number, number][] = [
  [124, 92, 246], // violet
  [190, 75, 219], // magenta
  [232, 74, 143], // pink
  [225, 51, 74], // red
  [248, 96, 76], // coral / bright red
];

function gradient(t: number): [number, number, number] {
  const n = STOPS.length - 1;
  const scaled = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(scaled), n - 1);
  const local = scaled - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * local)) as [
    number,
    number,
    number,
  ];
}

function paint(ch: string, t: number, mode: Mode): string {
  if (ch === " ") return " ";
  if (mode === "none") return ch;
  if (mode === "basic") return t < 0.5 ? pc.magentaBright(ch) : pc.redBright(ch);
  const [r, g, b] = gradient(t);
  return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[39m`;
}

/** One-line fallback for narrow terminals / no TTY. */
function compact(mode: Mode): string {
  return "  " + (mode === "none" ? "partweave" : word2tone("partweave", mode));
}

function word2tone(word: string, mode: Mode): string {
  if (mode === "none") return word;
  return [...word]
    .map((ch, i) => paint(ch, word.length > 1 ? i / (word.length - 1) : 0, mode))
    .join("");
}

export function renderBanner(): string {
  const mode = colorMode();
  // No TTY (piped, CI logs): keep it to a single line, not a 5-row block.
  if (!process.stdout.isTTY) return compact(mode);
  const cols = process.stdout.columns ?? 80;

  // Assemble each row by concatenating the glyphs with a single-space gutter.
  const rows: string[] = [];
  for (let r = 0; r < HEIGHT; r++) {
    rows.push([...WORD].map((ch) => GLYPHS[ch]?.[r] ?? "").join(" "));
  }
  const width = rows[0].length;
  if (width + 2 > cols) return compact(mode);

  const painted = rows.map((row, r) =>
    "  " +
    [...row]
      .map((ch, c) =>
        ch === " " ? " " : paint(weaveCell(r, c), width > 1 ? c / (width - 1) : 0, mode),
      )
      .join(""),
  );
  return painted.join("\n");
}
