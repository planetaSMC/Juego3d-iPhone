#!/usr/bin/env bash
#
# Construye un .ipa SIN FIRMAR a partir del proyecto Xcode de este repo.
#
# Sirve para dos cosas:
#   1. Correrlo en una Mac (propia o alquilada por hora) y quedarse con el .ipa.
#   2. Correrlo en un runner macOS de la nube (GitHub Actions), que es la
#      forma de obtener el .ipa sin tener una Mac.
#
# El .ipa no lleva firma: lo firma despues AltStore / Sideloadly / Xcode con
# la cuenta de Apple de quien lo instala.
#
# Uso:
#   ./tools/build-ipa.sh              # deja dist/RasmaticLugar3D-unsigned.ipa
#   BUILD_DIR=/tmp/b ./tools/build-ipa.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/ios/RasmaticLugar3D.xcodeproj"
SCHEME="RasmaticLugar3D"
BUILD_DIR="${BUILD_DIR:-$ROOT/build}"
DIST="$ROOT/dist"
IPA="$DIST/RasmaticLugar3D-unsigned.ipa"

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
# Globo portable: `find -maxdepth` no existe en el find de macOS.
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

# El juego tiene que haber viajado dentro del bundle.
if [ ! -f "$APP/www/index.html" ]; then
  echo "La .app no incluye www/index.html: el folder reference no se copio." >&2
  exit 1
fi

echo
echo "== Empaquetando .ipa =="
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/Payload"
cp -R "$APP" "$STAGE/Payload/"
mkdir -p "$DIST"
rm -f "$IPA"
( cd "$STAGE" && zip -qry "$IPA" Payload )

SIZE="$(wc -c < "$IPA" | tr -d ' ')"
HASH="$(shasum -a 256 "$IPA" | cut -d' ' -f1)"
echo "IPA: $IPA"
echo "     $SIZE B"
echo "     SHA-256 $HASH"
echo
echo "Siguiente paso: instalar ese .ipa con AltStore/Sideloadly o Xcode."
echo "Ver docs/instalar-en-iphone.md"
