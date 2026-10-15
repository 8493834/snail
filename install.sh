#!/bin/sh
# Installs the Snail desktop app from the newest GitHub Release.
#   Linux (Debian/Ubuntu/Chromebook):  sudo sh install.sh      (uses the .deb, or the AppImage if there is no apt)
#   macOS:                             sh install.sh           (copies Snail.app into /Applications)
# Options (environment):  SNAIL_REPO=owner/repo   SNAIL_TAG=latest|v1.2.0
set -eu
REPO="${SNAIL_REPO:-8493834/snail}"
TAG="${SNAIL_TAG:-latest}"
if [ "$TAG" = "latest" ]; then API="https://api.github.com/repos/$REPO/releases/latest"; else API="https://api.github.com/repos/$REPO/releases/tags/$TAG"; fi
say() { printf '%s\n' "$*"; }
die() { printf 'snail install: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is needed (sudo apt install curl)"
JSON="${SNAIL_API_JSON:-}"
[ -n "$JSON" ] || JSON=$(curl -fsSL "$API") || die "can't read the release '$TAG' of $REPO (is it public, and has the build finished?)"

# every file attached to the release
URLS=$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/')
pick() { printf '%s\n' "$URLS" | grep -E "$1" | head -n 1 || true; }

OS=$(uname -s); ARCH=$(uname -m)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

case "$OS" in
Linux)
  case "$ARCH" in x86_64|amd64) ;; *) die "the Linux build is for 64-bit Intel/AMD (x86_64); this computer is $ARCH" ;; esac
  DEB=$(pick '\.deb$'); APPIMG=$(pick '\.AppImage$')
  if [ -n "$DEB" ] && command -v apt-get >/dev/null 2>&1; then
    SUDO=""
    if [ "$(id -u)" -ne 0 ]; then
      command -v sudo >/dev/null 2>&1 || die "run this as root (or install sudo)"
      SUDO="sudo"
    fi
    say "Downloading $DEB"
    curl -fL --progress-bar -o "$TMP/snail.deb" "$DEB"
    chmod 644 "$TMP/snail.deb"
    $SUDO apt-get install -y "$TMP/snail.deb"
    say "Installed. Start it from your app menu."
  elif [ -n "$APPIMG" ]; then
    DEST="${SNAIL_DIR:-$HOME/.local/bin}"
    [ "$(id -u)" -ne 0 ] || DEST=/usr/local/bin
    mkdir -p "$DEST"
    say "Downloading $APPIMG"
    curl -fL --progress-bar -o "$DEST/Snail.AppImage" "$APPIMG"
    chmod +x "$DEST/Snail.AppImage"
    say "Installed $DEST/Snail.AppImage"
  else
    die "no Linux download found in the release (the build may still be running)"
  fi ;;
Darwin)
  DMG=$(pick '\.dmg$')
  [ -n "$DMG" ] || die "no .dmg found in the release"
  say "Downloading $DMG"
  curl -fL --progress-bar -o "$TMP/snail.dmg" "$DMG"
  MNT="$TMP/mnt"; mkdir -p "$MNT"
  hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$TMP/snail.dmg"
  APP=$(ls -d "$MNT"/*.app | head -n 1)
  cp -R "$APP" /Applications/
  hdiutil detach -quiet "$MNT"
  say "Installed in /Applications. (The app is unsigned: the first time, right-click it and choose Open.)" ;;
*)
  die "this installer covers Linux and macOS. On Windows download the .exe from https://github.com/$REPO/releases" ;;
esac
