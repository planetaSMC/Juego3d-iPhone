> **Documento histórico V19.** V20 unifica las dos apps en RASMATIC VR
> (com.rasmatic.lugar3d). Se conserva como referencia y recuperación; ver
> docs/v20/README.md.

# V19 Â· Dos aplicaciones independientes

RASMATIC Lugar 3D pasa de una app a **dos apps instalables a la vez**:

| App | Nombre visible | Bundle ID | Artefacto |
|---|---|---|---|
| **RASMATIC VR HEAD TRACKING** | RASMATIC HT | `com.rasmatic.lugar3d.headtracking` | `dist/RASMATIC-HeadTracking-unsigned.ipa` |
| **RASMATIC VR CLASSIC** | RASMATIC CLASSIC | `com.rasmatic.lugar3d.classic` | `dist/RASMATIC-Classic-unsigned.ipa` |

La app heredada `RasmaticLugar3D` (`com.rasmatic.lugar3d`) **no se elimina**
del proyecto: queda como respaldo V18 y solo se compila con
`WITH_LEGACY=1 ./tools/build-ipa.sh`.

---

## 1. Arquitectura

```
Juego Android (fuente canÃ³nica)
        â”‚
        â–¼
tools/build-ios.js
        â”‚
        â”œâ”€â”€ web/          â†’ ios/RasmaticHeadTracking/www   (Head Tracking)
        â””â”€â”€ web-classic/  â†’ ios/RasmaticClassic/www       (Classic)
```

- El **nÃºcleo del juego es el mismo**: `game.js`, `modes.js`,
  `android-bridge.js`, `android-game.css`, `android-controls.css`, `three.js`,
  fuentes, `vr/` y `net/` se copian byte a byte a las dos variantes.
- La diferencia se inyecta al cargar la pÃ¡gina:
  - `window.RasmaticApp` con `id`, nombre, `headTracking` y `storagePrefix`.
  - `window.RasmaticStore`, que prefija las claves de `localStorage`.
  - `headtracking/head-tracking.js` + `.css` solo en Head Tracking.
- El proyecto Xcode tiene **tres targets**:
  - `RasmaticHeadTracking` (nuevo, Core Motion).
  - `RasmaticClassic` (nuevo, sin Core Motion).
  - `RasmaticLugar3D` (heredado, intacto como respaldo).
- Los Swift compartidos son `AppDelegate.swift`, `GameViewController.swift` y
  `GamepadBridge.swift`. `HeadTrackingBridge.swift` **solo se compila en el
  target Head Tracking** (sÃ­mbolo `RASMATIC_HEAD_TRACKING`).
- Cada target tiene su `Info.plist`, `Assets.xcassets`, `www`, bundle ID,
  display name, icono, esquema y producto `.app`.

### Persistencia aislada

| Dato | Head Tracking | Classic |
|---|---|---|
| Dificultad del bot | `rasmatic.botDifficulty` | `rasmatic.classic.botDifficulty` |
| PersonalizaciÃ³n V18 | `rasmatic.ui.v1` | `rasmatic.classic.ui.v1` |
| Ajustes VR | `rasmatic.vr.settings.v2` | `rasmatic.classic.vr.settings.v2` |
| Perfiles VR | `rasmatic.vr.profiles.v1` | `rasmatic.classic.vr.profiles.v1` |
| Enlace con Windows | `rasmatic.vr.link.v1` | `rasmatic.classic.vr.link.v1` |
| Joystick | `rasmatic.joystick` | `rasmatic.classic.joystick` |
| Head tracking | `rasmatic.ht.sensitivity`, `rasmatic.ht.smoothing` | no aplica |

Las claves se muestran sin prefijo; `RasmaticStore` las traduce. En la app
nativa cada app ya tiene su propio contenedor de WKWebView; el prefijo ademÃ¡s
protege el caso de las dos PWA servidas desde el mismo origen.

---

## 2. Head Tracking real en iOS

### TecnologÃ­a elegida: Core Motion

- `CMMotionManager` + `CMDeviceMotion`.
- Se lee `CMAttitude` (`yaw`, `pitch`, `roll`) a **60 Hz**.
- Referencia `xArbitraryZVertical`: Z vertical y rumbo relativo al arranque.
  No usa magnetÃ³metro (mÃ¡s estable en interiores).
- El puente nativo envÃ­a la orientaciÃ³n a JavaScript:

```js
window.RasmaticNativeHeadTracking.raw(yaw, pitch, roll)     // radianes
window.RasmaticNativeHeadTracking.status(disponible, nombre)
```

- El JS calcula la **diferencia con el punto de recentrado**, aplica
  sensibilidad y suavizado exponencial, y entrega un offset de render.
- **No se usa la cÃ¡mara.** El `Info.plist` de Head Tracking no declara
  `NSCameraUsageDescription`.

### Por quÃ© no ARKit

ARKit ofrece 6DoF con cÃ¡mara y seguimiento posicional. Para este juego basta
3DoF de orientaciÃ³n (yaw/pitch/roll), que Core Motion entrega sin cÃ¡mara, con
menos baterÃ­a y en mÃ¡s modelos de iPhone. No se promete seguimiento
posicional de seis grados de libertad.

### Fallback web

La PWA (Safari/Android) usa `DeviceOrientationEvent`. En iOS 13+ el permiso se
pide con un gesto del usuario (`DeviceOrientationEvent.requestPermission()`).
En la app nativa no se pide ese permiso web: Core Motion entrega los datos
directamente y el sistema aplica su propio control de movimiento.

### Estados que ve el usuario

| Estado | QuÃ© significa |
|---|---|
| `SIN SENSORES` | El dispositivo no expone orientaciÃ³n; no se simula nada. |
| `ACTIVAR HT` | Falta un toque para pedir permiso (PWA iOS). |
| `CONECTANDOâ€¦` | Se pidiÃ³ el sensor y se esperan muestras. |
| `HT ACTIVO` | Llegan datos reales y la cÃ¡mara responde. |
| `PERMISO DENEGADO` | El usuario rechazÃ³ el permiso de orientaciÃ³n. |
| `SIN RESPUESTA` | No llegaron muestras: sensor ausente o permiso bloqueado. |

### Controles

- Barra flotante `HEAD TRACKING` con `ACTIVAR` y `âŸ³ RECENTRAR`.
- Tecla **R**: recentra.
- En el panel VR: `ACTIVAR HT` y `Recentrar cabeza`.
- En Opciones (âš™): activar/desactivar, sensibilidad (0,2Ã—â€“2,5Ã—) y suavizado
  (0,03â€“0,45 s). Los valores se guardan.
- Al activar/desactivar el offset entra y sale con una mezcla suave, sin
  saltos bruscos.

### VR Box / SBS

El offset se aplica **solo durante el render**, en
`web/vr/vr-preview.js`:

1. Se parte de la cÃ¡mara real del juego.
2. Se premultiplica el yaw sobre el eje vertical del mundo (horizonte estable).
3. Se multiplican pitch y roll locales.
4. Se renderiza cada ojo con su frustum off-axis y su IPD.
5. Se restaura la cÃ¡mara original.

Por eso **no se toca** `PP.yaw`, `PP.pitch`, el estado, el IPD, la
convergencia ni la intensidad 3D. Las dos mitades SBS usan el mismo offset y
el HUD duplicado por ojo se mantiene.

---

## 3. Joystick opcional en las dos apps

OpciÃ³n **JOYSTICK: ACTIVADO / DESACTIVADO** en âš™.

- **Desactivado**: se oculta `#ras-stick`, se ignoran sus entradas y se
  sueltan las que estuvieran activas. CORRER, la cÃ¡mara tÃ¡ctil, la interacciÃ³n,
  el mando Bluetooth y el head tracking siguen funcionando.
- **Activado**: comportamiento actual.
- Se guarda en `rasmatic.joystick` o `rasmatic.classic.joystick` segÃºn la app.

El mando Bluetooth (GameController) **no se desactiva** con esta opciÃ³n: es un
control independiente del joystick tÃ¡ctil.

---

## 4. CompilaciÃ³n

### Todo en Windows

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
```

Hace: iconos â†’ `web/` + `web-classic/` â†’ espejos iOS â†’ paridad â†’ check-xcode.

### Los dos `.ipa` sin firmar (macOS o GitHub Actions)

```bash
./tools/build-ipa.sh
```

Deja:

- `dist/RASMATIC-HeadTracking-unsigned.ipa`
- `dist/RASMATIC-Classic-unsigned.ipa`

La app heredada, solo si se pide:

```bash
WITH_LEGACY=1 ./tools/build-ipa.sh
```

### VerificaciÃ³n de cada paquete

```bash
node tools/verify-ipa.js dist/RASMATIC-HeadTracking-unsigned.ipa \
  --expect com.rasmatic.lugar3d.headtracking --variant headtracking

node tools/verify-ipa.js dist/RASMATIC-Classic-unsigned.ipa \
  --expect com.rasmatic.lugar3d.classic --variant classic
```

`verify-ipa.js` comprueba Mach-O, bundle ID, juego completo dentro de `www/`,
permisos distintos y ausencia de `headtracking/` en Classic.

### GitHub Actions

`.github/workflows/ios-ipa.yml` ejecuta check-xcode, check-parity, compila los
dos esquemas, verifica cada `.ipa` y sube el artefacto **`rasmatic-v19-ipas`**
con los dos archivos.

---

## 5. InstalaciÃ³n simultÃ¡nea

Los bundle IDs son distintos, por lo que iOS las trata como apps separadas:

1. Firmar e instalar `RASMATIC-HeadTracking-unsigned.ipa` con Sideloadly,
   AltStore o Xcode.
2. Firmar e instalar `RASMATIC-Classic-unsigned.ipa` del mismo modo.
3. Las dos quedan en la pantalla de inicio con iconos distintos
   (banda azul `HT` / banda Ã¡mbar `CL`).
4. Actualizar o borrar una **no** modifica la otra.

GuÃ­a general: `docs/instalar-en-iphone.md`.

---

## 6. Pruebas realizadas

En este entorno (Windows, sin macOS/Xcode ni iPhone fÃ­sico):

| ComprobaciÃ³n | Resultado |
|---|---|
| `node tools/check-xcode.js` | estructura de 3 targets, plists, permisos, iconos, esquemas y espejos |
| `node tools/check-parity.js` | nÃºcleo idÃ©ntico; solo difieren identidad, manifest, sw e iconos |
| `node tools/test-web.js` | suite web V18/V19 sobre Head Tracking |
| `node tools/test-web.js --root web-classic` | misma suite sobre Classic |
| `node tools/test-vr.js` | VR/SBS, IPD, convergencia e intensidad 3D |
| `node tools/test-pad.js` | mando nativo GameController y VR |
| `node tools/test-v19.js` | head tracking nativo simulado, sensibilidad, suavizado, recentrado, joystick on/off, persistencia y aislamiento |

Los resultados concretos y capturas se guardan en `docs/evidencias/` y se
resumen en `docs/pruebas.md`.

### Lo que NO estÃ¡ validado

- **CompilaciÃ³n real y firma** de los `.ipa`: requieren macOS/Xcode o el
  runner de GitHub Actions.
- **Head Tracking fÃ­sico**: no hay iPhone ni VR Box en este entorno. Las
  pruebas con datos simulados validan la lÃ³gica, no los sensores reales.
- **Permisos reales de iOS**: el prompt de movimiento y su denegaciÃ³n solo se
  pueden comprobar en un iPhone.
- **InstalaciÃ³n simultÃ¡nea real**: se validan bundle IDs y artefactos, pero no
  se instalaron en un dispositivo fÃ­sico.
- **Legibilidad dentro de las VR Box**: depende del visor y del iPhone.

No se afirma que el head tracking estÃ© validado fÃ­sicamente.

---

## 7. Archivos clave

| Archivo | FunciÃ³n |
|---|---|
| `tools/build-ios.js` | genera `web/` y `web-classic/` + espejos iOS |
| `tools/make-icons.ps1` | iconos HT/CL y Assets.xcassets |
| `tools/check-parity.js` | compara el nÃºcleo de las dos apps |
| `tools/check-xcode.js` | valida targets, plists, permisos y compilaciÃ³n |
| `tools/build-ipa.sh` | compila los dos `.ipa` |
| `tools/verify-ipa.js` | verifica cada `.ipa` y su variante |
| `.github/workflows/ios-ipa.yml` | build en la nube |
| `web/headtracking/head-tracking.js` | consumo nativo/web, suavizado y UI |
| `web/vr/vr-preview.js` | aplica el offset al render SBS |
| `ios/RasmaticLugar3D/HeadTrackingBridge.swift` | Core Motion â†’ JS |
| `ios/RasmaticLugar3D/GameViewController.swift` | variante, permisos y puentes |
| `ios/RasmaticHeadTracking/Info.plist` | `NSMotionUsageDescription` |
| `ios/RasmaticClassic/Info.plist` | sin permisos de sensores |

---

## 8. Estado de los artefactos web (V19)

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `web/index.html` (Head Tracking) | 267.542 | `8E71ED2F2C46EFBFB598A9CA4FABE64212A1F8D725D73790F7C1D5663BF65755` |
| `web-classic/index.html` (Classic) | 267.445 | `873C357B48ADD1529285B71045981447A539DA9862FDADD3935EC866D60602A3` |
| `web/mobile/game.js` | â€” | `87F8C95613A40A655914774C21A3FA554633DD21B159366A720A5D6E12CBAD80` |
| `web/mobile/android-bridge.js` | â€” | `6AD5C69F1CFE5D9557E2B8C77259DF8AE702C2083461F1389CAF1354B32BBC65` |
| `web/mobile/android-game.css` | â€” | `58D66AE44655BE7D0EA638371A5FB7116296D0FE764EABE493D50C4EF1A18572` |
| `web/mobile/android-controls.css` | â€” | `29C186FA2ADE2F4896BD8A4B664E372531ADF1574A050D5EE1AA5791D228C180` |
| `web/vr/vr-preview.js` | â€” | `F7477F9237EC783871CA8348BA1A8C48893BBAE2D290AD68C904A3F73C4CDD7E` |
| `web/headtracking/head-tracking.js` | â€” | `B0FAA62EE144771C6AAEFD9FCA51212F0E94F7E56196F34F7993BA17370A5676` |
| `web/headtracking/head-tracking.css` | â€” | `45716AC89F69A7A24A710C795BC508A17BDF4BB6595C46E6F3BE7B1E8E8E0721` |

Service workers:

- Head Tracking: `rasmatic-ht-e9b7b839ed4c96a7`
- Classic: `rasmatic-classic-a196a578abfc51f5`

Estos hashes corresponden a la compilaciÃ³n local del 26/11/2026. Los `.ipa`
reales se generan en macOS y su SHA-256 lo imprime `tools/build-ipa.sh` y el
flujo de GitHub Actions.
