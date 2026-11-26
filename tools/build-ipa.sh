#!/usr/bin/env bash
#
# Construye los .ipa SIN FIRMAR de las dos apps V19 a partir del proyecto
# Xcode de este repo:
#
#   RASMATIC VR HEAD TRACKING -> dist/RASMATIC-HeadTracking-unsigned.ipa
#   RASMATIC VR CLASSIC       -> dist/RASMATIC-Classic-unsigned.ipa
#
# El .ipa no lleva firma: lo firma después AltStore / Sideloadly / Xcode con
# la cuenta de Apple de quien lo instala.
#
# Uso:
#   ./tools/build-ipa.sh
#   BUILD_DIR=/tmp/b ./tools/build-ipa.sh
#   WITH_LEGACY=1 ./tools/build-ipa.sh   # además compila la app V18 heredada
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/ios/RasmaticLugar3D.xcodeproj"
BUILD_DIR="${BUILD_DIR:-$ROOT/build}"
DIST="$ROOT/dist"

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

build_app() {
  local name="$1"
  local scheme="$2"
  local bundle="$3"
  local ipa="$4"
  local variant="$5"
  local derived="$BUILD_DIR/$name"
  local products="$derived/Build/Products/Release-iphoneos"
  local app=""
  local candidate

  echo
  echo "== Compilando $scheme (Release, arm64, sin firma) =="
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$scheme" \
    -configuration Release \
    -sdk iphoneos \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$derived" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGN_ENTITLEMENTS="" \
    build

  for candidate in "$products"/*.app; do
    if [ -d "$candidate" ]; then
      app="$candidate"
      break
    fi
  done
  if [ -z "$app" ] || [ ! -d "$app" ]; then
    echo "No se genero la .app en $products" >&2
    exit 1
  fi

  # El bundle id tiene que ser el de ESTA app, no el de la otra.
  local actual
  actual="$(plutil -extract CFBundleIdentifier raw -o - "$app/Info.plist")"
  if [ "$actual" != "$bundle" ]; then
    echo "Bundle id incorrecto en $scheme: $actual (se esperaba $bundle)" >&2
    exit 1
  fi

  # El juego tiene que haber viajado dentro del bundle.
  if [ ! -f "$app/www/index.html" ]; then
    echo "La .app no incluye www/index.html: el folder reference no se copio." >&2
    exit 1
  fi
  if [ "$variant" = "headtracking" ] && [ ! -f "$app/www/headtracking/head-tracking.js" ]; then
    echo "Head Tracking no incluye www/headtracking/head-tracking.js" >&2
    exit 1
  fi
  if [ "$variant" = "classic" ] && [ -e "$app/www/headtracking" ]; then
    echo "Classic incluye archivos de head tracking y no deberia." >&2
    exit 1
  fi

  echo
  echo "== Empaquetando $name =="
  local stage
  stage="$(mktemp -d)"
  mkdir -p "$stage/Payload"
  cp -R "$app" "$stage/Payload/"
  rm -f "$ipa"
  ( cd "$stage" && zip -qry "$ipa" Payload )
  rm -rf "$stage"

  local size hash
  size="$(wc -c < "$ipa" | tr -d ' ')"
  hash="$(shasum -a 256 "$ipa" | cut -d' ' -f1)"
  echo "IPA: $ipa"
  echo "     $size B"
  echo "     SHA-256 $hash"
  echo "     bundle: $actual  variante: $variant"
}

build_app "RasmaticHeadTracking" "RasmaticHeadTracking" \
  "com.rasmatic.lugar3d.headtracking" \
  "$DIST/RASMATIC-HeadTracking-unsigned.ipa" "headtracking"

build_app "RasmaticClassic" "RasmaticClassic" \
  "com.rasmatic.lugar3d.classic" \
  "$DIST/RASMATIC-Classic-unsigned.ipa" "classic"

if [ "${WITH_LEGACY:-0}" = "1" ]; then
  build_app "RasmaticLugar3D" "RasmaticLugar3D" \
    "com.rasmatic.lugar3d" \
    "$DIST/RasmaticLugar3D-unsigned.ipa" "legacy"
fi

echo
echo "Listo. Las dos apps se pueden instalar a la vez: bundle ids distintos."
echo "Siguiente paso: AltStore/Sideloadly o Xcode. Ver docs/instalar-en-iphone.md"
echo "y docs/v19-dos-apps.md."
