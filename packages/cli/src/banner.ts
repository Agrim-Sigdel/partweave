import pc from "picocolors";

/**
 * The "partweave" wordmark: a small pixel banner rendered in faux-3D — each glyph
 * has a woven gradient front face and a gray extruded side, so it reads as raised
 * blocks — beside a dim loom of interlacing warp/weft threads (the name, drawn).
 * Built entirely from strings (no deps) and degrades on purpose so it "works on
 * anything":
 *   - truecolor terminal  → 24-bit gradient front + gray 3D side + dim threads
 *   - basic color         → magenta→red front, gray side, dim threads
 *   - NO_COLOR             → plain blocks; the 3D side + weave still read by shape
 *   - narrow / no TTY      → a one-line `partweave` fallback
 * Glyphs use Block Elements + Box Drawing (both classic Unicode ranges), so they
 * render wherever a solid block would.
 */

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

// Woven front face: a █/▓ checkerboard reads as interlaced threads.
const weaveCell = (row: number, col: number): string => ((row + col) % 2 ? "▓" : "█");

// Threads on a loom: warp (│) and weft (━) interlacing over-under — a plain weave,
// the literal picture of the name. Every row is the same width.
const LOOM = ["┃━┃━", "━┃━┃", "┃━┃━", "━┃━┃", "┃━┃━"];

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

/** Paint the front (lit) face of a glyph cell in the gradient. */
function paintFace(ch: string, t: number, mode: Mode): string {
  if (ch === " ") return " ";
  if (mode === "none") return ch;
  if (mode === "basic") return t < 0.5 ? pc.magentaBright(ch) : pc.redBright(ch);
  const [r, g, b] = gradient(t);
  return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[39m`;
}

/** Paint the extruded side face — a neutral gray shadow that gives the 3D depth. */
function paintShadow(ch: string, mode: Mode): string {
  if (ch === " ") return " ";
  if (mode === "none") return ch;
  if (mode === "basic") return pc.gray(ch);
  return `\x1b[38;2;110;110;110m${ch}\x1b[39m`;
}

/** Paint a loom thread: dim so the wordmark stays the hero. */
function paintThread(ch: string, mode: Mode): string {
  if (ch === " ") return " ";
  if (mode === "none") return ch;
  if (mode === "basic") return pc.dim(ch);
  return `\x1b[38;2;120;110;140m${ch}\x1b[39m`;
}

function word2tone(word: string, mode: Mode): string {
  if (mode === "none") return word;
  return [...word]
    .map((ch, i) => paintFace(ch, word.length > 1 ? i / (word.length - 1) : 0, mode))
    .join("");
}

/** One-line fallback for narrow terminals / no TTY. */
function compact(mode: Mode): string {
  return "  " + (mode === "none" ? "partweave" : word2tone("partweave", mode));
}

export function renderBanner(): string {
  const mode = colorMode();
  // No TTY (piped, CI logs): keep it to a single line, not a multi-row block.
  if (!process.stdout.isTTY) return compact(mode);

  // Assemble each glyph row with a single-space gutter between letters.
  const rows: string[] = [];
  for (let r = 0; r < HEIGHT; r++) {
    rows.push([...WORD].map((ch) => GLYPHS[ch]?.[r] ?? "").join(" "));
  }
  const glyphW = rows[0].length;
  const total = 2 + LOOM[0].length + 1 + (glyphW + 1); // indent + loom + gutter + wordmark(+side)
  if (total > (process.stdout.columns ?? 80)) return compact(mode);

  const front = (r: number, c: number): boolean =>
    r >= 0 && r < HEIGHT && c >= 0 && c < glyphW && rows[r][c] === "█";

  const out: string[] = [];
  for (let R = 0; R < HEIGHT; R++) {
    const loom = [...LOOM[R]].map((ch) => paintThread(ch, mode)).join("");
    let mark = "";
    for (let C = 0; C <= glyphW; C++) {
      const t = glyphW > 1 ? Math.min(C, glyphW - 1) / (glyphW - 1) : 0;
      if (front(R, C)) mark += paintFace(weaveCell(R, C), t, mode); // woven gradient front
      else if (front(R, C - 1)) mark += paintShadow("░", mode); // gray extruded side (depth)
      else mark += " ";
    }
    out.push("  " + loom + " " + mark);
  }
  return out.join("\n");
}
