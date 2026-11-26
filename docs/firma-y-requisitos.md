# Firma, requisitos y estado real de la entrega

Este documento separa tres cosas que suelen confundirse:

1. **Compilar** la app (convertir el proyecto Xcode en un `.ipa`).
2. **Firmar** ese `.ipa` con una cuenta Apple.
3. **Instalarlo** en un iPhone.

En este proyecto se preparó todo para las tres, pero solo se pudo ejecutar la
parte que no necesita hardware Apple. Acá está el detalle honesto de qué existe,
qué falta y qué necesita cada paso.

---

## 1. Estado actual (12 de noviembre de 2026)

| Pieza | Estado | Dónde |
|---|---|---|
| Proyecto Xcode completo | Listo y verificado | `ios/RasmaticLugar3D.xcodeproj` |
| Juego dentro de la app (`www/`) | Copiado byte a byte | `ios/RasmaticLugar3D/www/` |
| Flujo de compilación en macOS | Listo | `.github/workflows/ios-ipa.yml` |
| Script de compilación | Listo | `tools/build-ipa.sh` |
| Verificador del `.ipa` | Listo y probado con un IPA sintético | `tools/verify-ipa.js` |
| Publicación automática por API | Listo (necesita token) | `tools/publish-github.js` |
| **`.ipa` compilado de verdad** | **No existe todavía** | requiere runner macOS |
| **Firma con Apple** | **No hecha** | requiere Apple ID/certificado |
| **Instalación en iPhone** | **No probada** | requiere iPhone + cable/Wi-Fi |

**No hay ningún `.ipa` en `dist/`** porque este proyecto se preparó en Windows
y `xcodebuild` solo funciona en macOS. El ZIP de entrega incluye todo lo
necesario para generarlo, pero no un binario compilado que no se pueda
producir acá.

Tampoco se generaron credenciales, certificados, perfiles de aprovisionamiento
ni contraseñas: eso lo tiene que hacer la persona que instala la app con **su**
cuenta Apple.

---

## 2. Requisitos por etapa

### Para compilar y probar en Windows (lo que ya se hizo)

| Requisito | Detalle |
|---|---|
| Windows 10/11 | Es el entorno usado |
| Node.js 18 o posterior | Probado con Node 24 |
| Chrome o Edge (Chromium) | Para las suites automáticas; también se puede definir `CHROME_PATH` |
| Nada de Apple | No hace falta Mac, Xcode ni iPhone |

### Para compilar el `.ipa`

| Opción | Requisito | Costo |
|---|---|---|
| **GitHub Actions** (recomendada sin Mac) | Cuenta GitHub + repositorio; el flujo usa `macos-14` | Gratis en repos públicos; en privados consume minutos |
| **Mac propia o prestada** | macOS con Xcode 15 o posterior | $0 |
| **Mac alquilada por hora** | MacinCloud, Scaleway, MacStadium, etc. | ~US$1–30 según el plan; 1 hora alcanza |
| **TestFlight** | Apple Developer Program | US$99/año |

El flujo `.github/workflows/ios-ipa.yml` hace:

1. `xcodebuild -version` (deja constancia de la versión real).
2. `node tools/check-xcode.js` (135 comprobaciones del proyecto único).
3. `./tools/build-ipa.sh` (compila sin firma y arma el `.ipa`).
4. `node tools/verify-ipa.js ... --variant v20` (estructura, Mach-O, bundle id,
   permisos y juego completo).
5. Sube `dist/RASMATIC-VR-unsigned.ipa` como artefacto `rasmatic-v20-ipa`.

### Para firmar e instalar

| Opción | Cuenta Apple | Duración | Requisitos |
|---|---|---|---|
| **Sideloadly** (Windows) | Gratis | 7 días, se renueva | Windows, iTunes/iCloud de la web de Apple, cable, Apple ID |
| **AltStore Classic** | Gratis | 7 días, renovación automática por Wi-Fi | PC encendida + AltServer, misma red |
| **Xcode** (Mac) | Gratis | 7 días | Mac + cable |
| **TestFlight** | Developer Program (US$99/año) | 90 días por versión | App Store Connect |
| **Cuenta paga + Sideloadly/AltStore** | Developer Program | 1 año | Certificado de desarrollo |

Límites de la cuenta gratuita (regla de Apple, no del proyecto):

- La app funciona **7 días**; después hay que volver a firmarla.
- Máximo **3 apps** instaladas a la vez con la misma cuenta.
- Máximo **10 App IDs** nuevos por semana.
- No sirve para App Store ni TestFlight.

---

## 3. Qué significa “sin firmar”

Un `.ipa` es un ZIP con esta forma:

```
Payload/
  RasmaticLugar3D.app/
    Info.plist
    RasmaticLugar3D          ← ejecutable Mach-O
    Assets.car
    www/                     ← el juego completo
    ...
```

El script compila con:

```bash
CODE_SIGNING_ALLOWED=NO
CODE_SIGNING_REQUIRED=NO
CODE_SIGN_IDENTITY=""
CODE_SIGN_ENTITLEMENTS=""
```

Eso produce un binario **válido pero sin firma**. Un iPhone sin jailbreak no lo
instala tal cual: el programa que lo instala (Sideloadly, AltStore o Xcode) lo
**firma en ese momento** con el certificado de tu Apple ID y un perfil de
aprovisionamiento. Por eso el archivo se llama `-unsigned.ipa`: describe lo que
es, no un defecto.

La firma cubre:

- El **certificado** (quién firma).
- El **perfil de aprovisionamiento** (qué dispositivo y qué App ID).
- El **bundle id** (`com.rasmatic.lugar3d`).
- Los **entitlements** (permisos). Esta app no pide cámara, red ni archivos, así
  que no necesita entitlements especiales.

---

## 4. Cómo obtener el `.ipa`

### Opción A — GitHub Actions (sin Mac)

1. Subir el proyecto a un repositorio de GitHub.
2. **Actions → iOS app V20 (RASMATIC VR) → Run workflow**.
3. Esperar ~10–15 minutos.
4. Descargar el artefacto **`rasmatic-v20-ipa`**.
5. Descomprimirlo: adentro está `RASMATIC-VR-unsigned.ipa`.

Si preferís no usar la web, `tools/publish-github.js` hace todo por API (crear
repo, subir, compilar, esperar, descargar y verificar). Necesita un **token
fine-grained** de GitHub con *Contents*, *Actions* y *Workflows* en lectura y
escritura:

```powershell
node tools/publish-github.js --token-file C:\ruta\al\token.txt
```

El token se guarda fuera del proyecto, no se imprime y conviene revocarlo al
terminar.

### Opción B — Mac

```bash
chmod +x tools/build-ipa.sh
./tools/build-ipa.sh
# deja dist/RASMATIC-VR-unsigned.ipa
```

### Verificación

```powershell
node tools/verify-ipa.js dist/RASMATIC-VR-unsigned.ipa `
  --expect com.rasmatic.lugar3d --variant v20
```

Comprueba, leyendo el ZIP real:

- que exista un único `Payload/*.app`;
- que `Info.plist` tenga el bundle id esperado y no quede
  `$(PRODUCT_BUNDLE_IDENTIFIER)`;
- que el ejecutable sea Mach-O (o universal);
- que estén `www/index.html`, `three.min.js`, `mobile/game.js`,
  `ios/ios-bridge.js`, `vr/vr-preview.js` y el manifest;
- que todos los recursos locales del `index.html` viajen adentro;
- que no haya rutas `android/` ni basura de macOS.

**No valida la firma de Apple.** Si encuentra `_CodeSignature`, solo lo informa.

---

## 5. Bundle id y equipo

El bundle id del proyecto es:

```
com.rasmatic.lugar3d
```

Si Apple lo rechaza porque ya está tomado, se cambia en
`ios/RasmaticLugar3D.xcodeproj/project.pbxproj`, en **ambas** configuraciones
(Debug y Release):

```
PRODUCT_BUNDLE_IDENTIFIER = com.tunombre.rasmatic;
```

Después hay que volver a compilar y verificar con:

```powershell
node tools/verify-ipa.js dist/RASMATIC-VR-unsigned.ipa --expect com.tunombre.rasmatic --variant v20
```

El **Team** se elige en Xcode → *Signing & Capabilities*. Para Sideloadly o
AltStore no hace falta configurarlo en el proyecto: ellos firman el `.ipa`
directamente con la cuenta que se les indica.

---

## 6. Seguridad y credenciales

- **Nunca** se pide ni se guarda la contraseña de Apple ID en el proyecto.
- Si la cuenta tiene doble factor (casi todas), Sideloadly/AltStore piden el
  código de 6 dígitos o una **contraseña de aplicación**.
- El token de GitHub se pasa por archivo (`--token-file`), no por argumento, y
  no se escribe en disco dentro del repo.
- No se incluyen certificados, `.p12`, `.mobileprovision` ni contraseñas.
- No hace falta jailbreak en ningún paso.

---

## 7. Lo que no se puede afirmar

Este entorno es Windows y no tiene iPhone ni Mac. Por eso **no** se puede
afirmar que:

- el proyecto compile en Xcode (sí está verificado estructuralmente);
- el `.ipa` exista (sí existe el flujo que lo produce);
- la app esté firmada (no lo está);
- la app se haya abierto en un iPhone;
- un mando Bluetooth real haya funcionado;
- las VR Box físicas se hayan probado.

Lo que sí está verificado está en `docs/pruebas.md`, separado por entorno:
Windows, simulaciones en Chromium y pendientes de macOS/iPhone.
