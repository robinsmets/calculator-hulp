#!/bin/bash
# Updates an installed Calculator hulp (or P3-Calculatorhulp-tool) to the
# latest release on GitHub, in place, so Chrome keeps loading the same folder.
#
# Published in both GitHub repositories and run with one line in Terminal:
#   curl -fsSL https://raw.githubusercontent.com/robinsmets/calculator-hulp/main/update-mac.sh | bash
#
# It is piped into bash, so its own stdin is the script: questions read from
# /dev/tty instead. Nothing here ships inside the extension.

set -euo pipefail

REMEMBERED="$HOME/.calculator-hulp-map"

ask() {
  local answer
  read -r -p "$1" answer < /dev/tty
  echo "$answer"
}

# The folder Chrome loads the extension from. Asked once, then remembered.
folder=""
if [ -f "$REMEMBERED" ]; then folder="$(cat "$REMEMBERED")"; fi
if [ -z "$folder" ] || [ ! -f "$folder/manifest.json" ]; then
  echo "Sleep de map van de extensie (de map met manifest.json) in dit venster en druk op Enter."
  folder="$(ask "Map: ")"
  # A dragged path arrives with escaped spaces or quotes, and a trailing space.
  folder="$(echo "$folder" | sed -e 's/\\ / /g' -e "s/^['\"]//" -e "s/['\"]* *$//")"
fi

if [ ! -f "$folder/manifest.json" ]; then
  echo "In \"$folder\" staat geen manifest.json. Kies de map die je in chrome://extensions hebt geladen."
  exit 1
fi

# Which extension this is decides which repository to update from.
name="$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' "$folder/manifest.json" | head -1)"
case "$name" in
  "Calculator hulp") repo="robinsmets/calculator-hulp" ;;
  "P3-Calculatorhulp-tool") repo="robinsmets/P3-Calculatorhulp-tool" ;;
  *) echo "Onbekende extensie in deze map: \"$name\"."; exit 1 ;;
esac
current="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$folder/manifest.json" | head -1)"

release="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest")"
latest="$(echo "$release" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)"
zip_url="$(echo "$release" | sed -n 's/.*"browser_download_url": *"\([^"]*\.zip\)".*/\1/p' | head -1)"

if [ -z "$zip_url" ]; then
  echo "Geen download gevonden op GitHub. Probeer het later opnieuw."
  exit 1
fi

echo "$folder" > "$REMEMBERED"

# A desktop icon that runs this same line, so the next update is a double
# click. Made here rather than downloaded: a file created on the machine
# itself carries no quarantine mark, so macOS opens it without a warning.
shortcut="$HOME/Desktop/Calculator hulp bijwerken.command"
if [ -d "$HOME/Desktop" ] && [ ! -f "$shortcut" ]; then
  printf '#!/bin/bash\ncurl -fsSL https://raw.githubusercontent.com/%s/main/update-mac.sh | bash\n' "$repo" > "$shortcut"
  chmod +x "$shortcut"
  echo "Op je bureaublad staat nu \"Calculator hulp bijwerken\": dubbelklik daarop voor de volgende update."
fi

if [ "$current" = "$latest" ]; then
  echo "$name $current is al de nieuwste versie."
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
curl -fsSL "$zip_url" -o "$work/update.zip"
unzip -q "$work/update.zip" -d "$work/new"

if [ ! -f "$work/new/manifest.json" ]; then
  echo "De download is niet compleet. Er is niets veranderd."
  exit 1
fi

# --delete drops files a newer version no longer has, so the folder ends up
# exactly like the release.
rsync -a --delete "$work/new/" "$folder/"

echo "$name bijgewerkt van $current naar $latest."
echo "Klik nu in chrome://extensions bij de extensie op het rondje (opnieuw laden), of herstart Chrome."
open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
