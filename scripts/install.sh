#!/usr/bin/env bash
#
# One-line installer for the base scaffolder.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/master/scripts/install.sh | bash
#
# Clones (or updates) base into ~/.base, builds the CLI, and drops a `base`
# launcher into ~/.local/bin. Override with env vars:
#   BASE_REPO=<git url>  BASE_HOME=<dir>  BASE_BIN_DIR=<dir>
set -euo pipefail

REPO="${BASE_REPO:-https://github.com/OWNER/REPO.git}"
HOME_DIR="${BASE_HOME:-$HOME/.base}"
BIN_DIR="${BASE_BIN_DIR:-$HOME/.local/bin}"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v git  >/dev/null 2>&1 || die "git is required"
command -v node >/dev/null 2>&1 || die "node >= 20 is required"
corepack enable >/dev/null 2>&1 || true
command -v pnpm >/dev/null 2>&1 || die "pnpm is required (try: corepack enable)"

if [ -d "$HOME_DIR/.git" ]; then
  say "Updating base in $HOME_DIR"
  git -C "$HOME_DIR" pull --ff-only
else
  say "Cloning base into $HOME_DIR"
  git clone --depth 1 "$REPO" "$HOME_DIR"
fi

say "Installing dependencies"
(cd "$HOME_DIR" && pnpm install)
say "Building the CLI"
(cd "$HOME_DIR" && pnpm --filter @base/cli build)

mkdir -p "$BIN_DIR"
ln -sf "$HOME_DIR/bin/base" "$BIN_DIR/base"
chmod +x "$HOME_DIR/bin/base"

say "Installed."
case ":$PATH:" in
  *":$BIN_DIR:"*) echo "Run:  base create" ;;
  *) echo "Add $BIN_DIR to your PATH, then run:  base create" ;;
esac
