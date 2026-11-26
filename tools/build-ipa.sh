#!/usr/bin/env bash
#
# V20 · Construye el .ipa SIN FIRMAR de RASMATIC VR.
#
# Una sola app:
#   RASMATIC VR · com.rasmatic.lugar3d
#   dist/RASMATIC-VR-unsigned.ipa
#
# Uso:
#   ./tools/build-ipa.sh
#   BUILD_DIR=/tmp/b ./tools/build-ipa.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/ios/RasmaticLugar3D.xcodeproj"
SCHEME="RasmaticVR"
BUNDLE="com.rasmatic.lugar3d"
BUILD_DIR="${BUILD_DIR:-$ROOT/build}"
DIST="$ROOT/dist"
IPA="$DIST/RASMATIC-VR-unsigned.ipa"

if [ ! -d "$PROJECT" ]; then
  echo "No encuentro el proyecto: $PROJECT" >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild no esta disponible. Este script necesita macOS con Xcode." >&2
  exit 1
fi

echo "== Xcode =="
xcodebuild -version
mkdir -p "$DIST"

echo
echo "== Compilando $SCHEME (Release, arm64, sin firma) =="
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  build

PRODUCTS="$BUILD_DIR/Build/Products/Release-iphoneos"
APP=""
for candidate in "$PRODUCTS"/*.app; do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done
if [ -z "${APP:-}" ] || [ ! -d "$APP" ]; then
  echo "No se genero la .app en $PRODUCTS" >&2
  exit 1
fi

ACTUAL="$(plutil -extract CFBundleIdentifier raw -o - "$APP/Info.plist")"
if [ "$ACTUAL" != "$BUNDLE" ]; then
  echo "Bundle id incorrecto: $ACTUAL (se esperaba $BUNDLE)" >&2
  exit 1
fi
DISPLAY="$(plutil -extract CFBundleDisplayName raw -o - "$APP/Info.plist")"
if [ "$DISPLAY" != "RASMATIC VR" ]; then
  echo "Nombre visible incorrecto: $DISPLAY" >&2
  exit 1
fi

for required in "www/index.html" "www/v20/pharmacy-scene.js" "www/v20/pharmacy-core.js" "www/headtracking/head-tracking.js"; do
  if [ ! -f "$APP/$required" ]; then
    echo "La .app no incluye $required" >&2
    exit 1
  fi
done
if [ -e "$APP/www/web-classic" ]; then
  echo "La .app incluye web-classic y no deberia." >&2
  exit 1
fi

echo
echo "== Empaquetando .ipa =="
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/Payload"
cp -R "$APP" "$STAGE/Payload/"
rm -f "$IPA"
( cd "$STAGE" && zip -qry "$IPA" Payload )

SIZE="$(wc -c < "$IPA" | tr -d ' ')"
HASH="$(shasum -a 256 "$IPA" | cut -d' ' -f1)"
echo "IPA: $IPA"
echo "     $SIZE B"
echo "     SHA-256 $HASH"
echo "     bundle: $ACTUAL"
echo "     nombre: $DISPLAY"
echo
echo "Siguiente paso: instalar con AltStore/Sideloadly o Xcode."
echo "Ver docs/instalar-en-iphone.md y docs/v20/README.md."
