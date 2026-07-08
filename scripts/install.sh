#!/usr/bin/env bash
#
# One-line installer for partweave.
#
#   curl -fsSL https://raw.githubusercontent.com/Agrim-Sigdel/partweave/main/scripts/install.sh | bash
#
# Clones (or updates) partweave into ~/.partweave, builds the CLI, and drops
# `partweave` (and a short `weave` alias) into ~/.local/bin. Override with:
#   PARTWEAVE_REPO=<git url>  PARTWEAVE_HOME=<dir>  PARTWEAVE_BIN_DIR=<dir>
set -euo pipefail

REPO="${PARTWEAVE_REPO:-https://github.com/Agrim-Sigdel/partweave.git}"
HOME_DIR="${PARTWEAVE_HOME:-$HOME/.partweave}"
BIN_DIR="${PARTWEAVE_BIN_DIR:-$HOME/.local/bin}"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v git  >/dev/null 2>&1 || die "git is required"
command -v node >/dev/null 2>&1 || die "node >= 20 is required"

# Prefer pnpm (the repo's native package manager); fall back to npm so a machine
# without pnpm can still build the CLI. corepack (bundled with Node) can provide pnpm.
corepack enable >/dev/null 2>&1 || true
if command -v pnpm >/dev/null 2>&1; then
  PM=pnpm
elif command -v npm >/dev/null 2>&1; then
  PM=npm
else
  die "need pnpm or npm to build the CLI (both come with Node — try: corepack enable)"
fi

if [ -d "$HOME_DIR/.git" ]; then
  say "Updating partweave in $HOME_DIR"
  git -C "$HOME_DIR" pull --ff-only
else
  say "Cloning partweave into $HOME_DIR"
  git clone --depth 1 "$REPO" "$HOME_DIR"
fi

say "Installing dependencies and building the CLI with $PM"
if [ "$PM" = pnpm ]; then
  (cd "$HOME_DIR" && pnpm install && pnpm --filter partweave build)
else
  (cd "$HOME_DIR" && npm install && npm run build -w partweave)
fi

mkdir -p "$BIN_DIR"
chmod +x "$HOME_DIR/bin/partweave"
ln -sf "$HOME_DIR/bin/partweave" "$BIN_DIR/partweave"
ln -sf "$HOME_DIR/bin/partweave" "$BIN_DIR/weave"

say "Installed."
case ":$PATH:" in
  *":$BIN_DIR:"*) echo "Run:  partweave create   (or: weave create)" ;;
  *) echo "Add $BIN_DIR to your PATH, then run:  partweave create" ;;
esac
