---
name: partweave-design
description: "Content and visual rules for anything created for partweave itself or shipped by partweave (the website, generated project UI, module descriptions, docs, CLI banners). Load before writing copy, adding a decorative mark, or touching a color token."
---

# partweave content & visual rules

These are standing rules for the partweave project (this repo), not general writing advice. They apply to: `apps/website`, any `modules/*` description/notes/UI, `packages/cli` user-facing strings, and generated-project content templates. They do not apply retroactively to every existing comment or doc in the repo — apply them to anything newly written or touched going forward.

## No emoji

Never use pictograph emoji (🧭 ✅ 🧩 🚀 etc.) in website copy, CLI output, module descriptions, or generated project content.

**Where a checkmark/status glyph is genuinely needed in a website or generated app UI**, use a real inline SVG icon component, not a unicode character — unicode glyphs render inconsistently across fonts/platforms and read as decoration-via-emoji even when they're not colorful pictographs. Example: `modules/example/web/app/profile/page.tsx` uses an inline `<svg>` checkmark next to "Signed in" rather than the string `"Signed in ✓"`.

**Where there's no cheap icon primitive** (plain React Native `<Text>` with no `react-native-svg` dependency already present), just drop the glyph rather than pull in a new dependency for one decorative mark — see `modules/example/mobile/app/profile.tsx`, which shows plain "Signed in" text with no icon substitute.

**CLI status glyphs are an exception.** `✓` / `✗` / `○` / `✔` in terminal output (`packages/cli/src/commands/doctor.ts`, `packages/cli/src/fetcher.ts`) are the standard idiom for CLI pass/fail/skip state (same convention npm, vitest, etc. use) and are not "emoji" in the sense this rule targets. Leave them.

## No em dash

Don't use — in copy written for the website, module descriptions/notes, or other user-facing content shipped by partweave. Rewrite with a period, comma, colon, or parentheses instead. This does not require retrofitting every existing code comment or the pre-existing `packages/cli/src/rootgen.ts` generator strings (those predate this rule and are internal comments / generated file headers, not polished website copy) — but any of those files touched for unrelated work should get cleaned up incidentally if convenient.

## Dark/light mode: verify contrast, don't eyeball it

Every color token in `apps/website/app/globals.css` (and any future themed module) is defined twice: once for light, once for dark. **Tuning one mode by eye is not sufficient** — a token that looks fine in the mode you're staring at can silently fail contrast in the other. This already happened once: `--accent-2` (gold) at `#b9862f` on light `--canvas` (`#f6f1e4`) computed to a 2.86:1 WCAG contrast ratio as text (fails the 4.5:1 AA minimum), while the same token in dark mode was fine at 8.94:1. Fixed by darkening the light-mode value to `#7d5c1a` (5.45:1).

**Rule**: before landing a new or changed color token that will be used as text, compute the WCAG relative-luminance contrast ratio against its background in *both* light and dark mode (relative luminance: `L = 0.2126*R + 0.7152*G + 0.0722*B` on gamma-corrected channels; contrast = `(Lmax+0.05)/(Lmin+0.05)`). Target ≥4.5:1 for normal text, ≥3:1 for large text/UI-component boundaries. Purely decorative, non-text uses (dividers, borders) are exempt. Never hardcode a color outside the `--token` system in a themed component — that's what breaks the light/dark pairing in the first place.

## Provenance

These three rules were established 2026-07-24 after a scratchpad-disk-full incident forced a pause on `apps/website` build verification; the user asked for them to be written down as standing rules for anything created for partweave going forward, not just fixed once.
