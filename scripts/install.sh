#!/usr/bin/env bash
#
# One-line installer for quick-build.
#
#   curl -fsSL https://raw.githubusercontent.com/Agrim-Sigdel/quick-build/main/scripts/install.sh | bash
#
# Clones (or updates) quick-build into ~/.quick-build, builds the CLI, and drops
# `quick-build` (and a short `qb` alias) into ~/.local/bin. Override with:
#   QUICK_BUILD_REPO=<git url>  QUICK_BUILD_HOME=<dir>  QUICK_BUILD_BIN_DIR=<dir>
set -euo pipefail

REPO="${QUICK_BUILD_REPO:-https://github.com/Agrim-Sigdel/quick-build.git}"
HOME_DIR="${QUICK_BUILD_HOME:-$HOME/.quick-build}"
BIN_DIR="${QUICK_BUILD_BIN_DIR:-$HOME/.local/bin}"

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
  say "Updating quick-build in $HOME_DIR"
  git -C "$HOME_DIR" pull --ff-only
else
  say "Cloning quick-build into $HOME_DIR"
  git clone --depth 1 "$REPO" "$HOME_DIR"
fi

say "Installing dependencies and building the CLI with $PM"
if [ "$PM" = pnpm ]; then
  (cd "$HOME_DIR" && pnpm install && pnpm --filter @agrimsigdel/quick-build build)
else
  (cd "$HOME_DIR" && npm install && npm run build -w @agrimsigdel/quick-build)
fi

mkdir -p "$BIN_DIR"
chmod +x "$HOME_DIR/bin/quick-build"
ln -sf "$HOME_DIR/bin/quick-build" "$BIN_DIR/quick-build"
ln -sf "$HOME_DIR/bin/quick-build" "$BIN_DIR/qb"

say "Installed."
case ":$PATH:" in
  *":$BIN_DIR:"*) echo "Run:  quick-build create   (or: qb create)" ;;
  *) echo "Add $BIN_DIR to your PATH, then run:  quick-build create" ;;
esac
