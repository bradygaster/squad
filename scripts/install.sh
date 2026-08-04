#!/bin/sh
# Squad standalone installer.
#
#   curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/dev/scripts/install.sh | sh
#
# Downloads a self-contained Squad bundle from GitHub Releases. The bundle
# vendors its own Node.js runtime, so neither Node nor npm needs to be present.
# Nothing is fetched from registry.npmjs.org.
#
# Environment:
#   VERSION   Squad version to install (default: latest release)
#   PREFIX    Install prefix (default: /usr/local as root, else $HOME/.local)
#   REPO      Source repository (default: bradygaster/squad)
#
# Mirrors the shape of GitHub Copilot CLI's installer so the two feel the same.

set -eu

REPO="${REPO:-bradygaster/squad}"
VERSION="${VERSION:-latest}"

if [ -z "${PREFIX:-}" ]; then
  if [ "$(id -u)" = "0" ]; then PREFIX="/usr/local"; else PREFIX="$HOME/.local"; fi
fi

err() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→\033[0m %s\n' "$1"; }

need() { command -v "$1" >/dev/null 2>&1 || err "'$1' is required but was not found on PATH."; }
need tar

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
  fetch_stdout() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO "$2" "$1"; }
  fetch_stdout() { wget -qO- "$1"; }
else
  err "Either curl or wget is required."
fi

# ---------------------------------------------------------------- detect target
os="$(uname -s)"
case "$os" in
  Linux) platform="linux" ;;
  Darwin) platform="darwin" ;;
  *) err "Unsupported operating system: $os. Windows users: install via winget or download the .zip from GitHub Releases." ;;
esac

machine="$(uname -m)"
case "$machine" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) err "Unsupported architecture: $machine" ;;
esac

target="${platform}-${arch}"

# ------------------------------------------------------------- resolve version
if [ "$VERSION" = "latest" ]; then
  info "Resolving latest release"
  VERSION="$(fetch_stdout "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1)"
  [ -n "$VERSION" ] || err "Could not resolve the latest release tag for ${REPO}."
fi

asset="squad-${target}.tar.gz"
url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"

# -------------------------------------------------------------------- download
tmp="$(mktemp -d)"
# shellcheck disable=SC2064
trap "rm -rf '$tmp'" EXIT INT TERM

info "Downloading ${asset} (${VERSION})"
fetch "$url" "$tmp/$asset" || err "Download failed: $url"

# Verify against the release checksum file when it is published.
if fetch "https://github.com/${REPO}/releases/download/${VERSION}/SHA256SUMS.txt" "$tmp/SHA256SUMS.txt" 2>/dev/null; then
  if command -v sha256sum >/dev/null 2>&1; then
    expected="$(grep " ${asset}\$" "$tmp/SHA256SUMS.txt" | awk '{print $1}')"
    actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    expected="$(grep " ${asset}\$" "$tmp/SHA256SUMS.txt" | awk '{print $1}')"
    actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
  else
    expected=""; actual=""
  fi
  if [ -n "$expected" ] && [ "$expected" != "$actual" ]; then
    err "Checksum mismatch for ${asset}. Expected ${expected}, got ${actual}."
  fi
  [ -n "$expected" ] && info "Checksum verified"
fi

# --------------------------------------------------------------------- install
libdir="${PREFIX}/lib/squad"
bindir="${PREFIX}/bin"

info "Installing to ${libdir}"
mkdir -p "$libdir" "$bindir"
rm -rf "${libdir:?}/"*
tar -xzf "$tmp/$asset" -C "$tmp"
# The archive contains a single squad-<target>/ directory.
cp -R "$tmp/squad-${target}/." "$libdir/"
chmod +x "$libdir/squad"
[ -f "$libdir/runtime/bin/node" ] && chmod +x "$libdir/runtime/bin/node"

ln -sf "$libdir/squad" "$bindir/squad"

printf '\033[32m✓\033[0m Squad %s installed to %s\n' "$VERSION" "$bindir/squad"

case ":${PATH}:" in
  *":${bindir}:"*) ;;
  *) printf '\n\033[33m!\033[0m %s is not on your PATH. Add it with:\n    export PATH="%s:$PATH"\n' "$bindir" "$bindir" ;;
esac

if ! command -v copilot >/dev/null 2>&1; then
  printf '\n\033[33m!\033[0m GitHub Copilot CLI was not found on PATH. Squad drives it, so install it too:\n'
  printf '    curl -fsSL https://gh.io/copilot-install | bash\n'
fi
