#!/usr/bin/env bash
# Builds the Agent Office screensaver (app extension), installs it in ~/Applications and registers it.
# Signed locally ("Sign to Run Locally"): works on this Mac only, no Apple Developer account needed.
#   saver/install.sh            build + install + register
#   saver/install.sh uninstall  unregister + remove
set -euo pipefail
cd "$(dirname "$0")"
APP_NAME="AgentOfficeSaver.app"
DEST="$HOME/Applications/$APP_NAME"
DD="$PWD/build"

if [ "${1:-}" = "uninstall" ]; then
  [ -d "$DEST" ] && pluginkit -r "$DEST/Contents/PlugIns/AppexSaverMinimalExtension.appex" || true
  rm -rf "$DEST"
  killall WallpaperAgent 2>/dev/null || true
  echo "Removed $DEST"
  exit 0
fi

xcodebuild -project AppexSaverMinimal.xcodeproj -scheme AppexSaverMinimal -configuration Release \
  -derivedDataPath "$DD" build >"$DD.log" 2>&1 || { tail -30 "$DD.log"; exit 1; }
BUILT="$DD/Build/Products/Release/$APP_NAME"

# The project's build phase registers the build-folder copy; keep a single registration (the installed one).
pluginkit -r "$BUILT/Contents/PlugIns/AppexSaverMinimalExtension.appex" 2>/dev/null || true
mkdir -p "$HOME/Applications"
[ -d "$DEST" ] && pluginkit -r "$DEST/Contents/PlugIns/AppexSaverMinimalExtension.appex" 2>/dev/null || true
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
# Running extension instances keep old code until the Wallpaper agent restarts (brief desktop flicker).
killall WallpaperAgent 2>/dev/null || true
sleep 2
# Registration right after a WallpaperAgent restart is sometimes dropped: retry until PlugInKit lists it.
for _ in 1 2 3 4 5; do
  pluginkit -a "$DEST/Contents/PlugIns/AppexSaverMinimalExtension.appex"
  sleep 2
  pluginkit -m -i dev.agent-office.saver.Extension | grep -q agent-office && break
done
pluginkit -m -v -i dev.agent-office.saver.Extension
echo "Installed $DEST — select « Agent Office » in System Settings → Wallpaper → Screen Saver."
