#!/bin/sh
# Turns the .deb files in a folder into a tiny "flat" apt repository, so people can run:
#   sudo apt install snail-code
# The folder is attached to a GitHub Release; apt then reads it from  .../releases/latest/download/
# Usage: sh tools/make-apt-repo.sh release
set -eu
DIR="${1:?usage: make-apt-repo.sh FOLDER}"
cd "$DIR"
command -v dpkg-scanpackages >/dev/null 2>&1 || sudo apt-get install -y dpkg-dev >/dev/null

WORK=$(mktemp -d)
n=0
for deb in ./*.deb; do
  [ -e "$deb" ] || continue
  # the desktop build is called snail-app inside; publish it under the name people will type
  rm -rf "$WORK/pkg"
  dpkg-deb -R "$deb" "$WORK/pkg"
  sed -i 's/^Package: .*/Package: snail-code/' "$WORK/pkg/DEBIAN/control"
  ver=$(dpkg-deb -f "$deb" Version)
  arch=$(dpkg-deb -f "$deb" Architecture)
  dpkg-deb --root-owner-group -b "$WORK/pkg" "snail-code_${ver}_${arch}.deb" >/dev/null
  rm -f "$deb"
  n=$((n + 1))
done
[ "$n" -gt 0 ] || { echo "no .deb files found - skipping the apt repository"; exit 0; }

dpkg-scanpackages --multiversion . /dev/null > Packages 2>/dev/null
gzip -9 -k -f Packages
{
  printf 'Origin: Snail\nLabel: Snail\nSuite: stable\nDate: %s\nArchitectures: amd64\nDescription: Snail desktop app\nSHA256:\n' "$(date -Ru)"
  for f in Packages Packages.gz; do
    printf ' %s %s %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c%s "$f")" "$f"
  done
} > Release
echo "apt repository ready: $(ls snail-code_*.deb | tr '\n' ' ')"
