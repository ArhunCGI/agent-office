#!/bin/bash
# Builds ~/Library/Screen Savers/AgentOffice.saver (legacy .saver run by legacyScreenSaver).
set -euo pipefail
cd "$(dirname "$0")"
OUT="$HOME/Library/Screen Savers/AgentOffice.saver"
rm -rf "$OUT"; mkdir -p "$OUT/Contents/MacOS"
cp Info.plist "$OUT/Contents/Info.plist"
swiftc -O -parse-as-library -emit-library -module-name AgentOffice \
  -Xlinker -bundle -framework ScreenSaver -framework WebKit -framework AppKit \
  -o "$OUT/Contents/MacOS/AgentOffice" AgentOfficeLegacyView.swift
codesign --force --sign - "$OUT"
echo "Installed $OUT"
