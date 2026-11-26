# V19 · Dos aplicaciones independientes

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
Juego Android (fuente canónica)
        │
        ▼
tools/build-ios.js
        │
        ├── web/          → ios/RasmaticHeadTracking/www   (Head Tracking)
        └── web-classic/  → ios/RasmaticClassic/www       (Classic)
```

- El **núcleo del juego es el mismo**: `game.js`, `modes.js`,
  `android-bridge.js`, `android-game.css`, `android-controls.css`, `three.js`,
  fuentes, `vr/` y `net/` se copian byte a byte a las dos variantes.
- La diferencia se inyecta al cargar la página:
  - `window.RasmaticApp` con `id`, nombre, `headTracking` y `storagePrefix`.
  - `window.RasmaticStore`, que prefija las claves de `localStorage`.
  - `headtracking/head-tracking.js` + `.css` solo en Head Tracking.
- El proyecto Xcode tiene **tres targets**:
  - `RasmaticHeadTracking` (nuevo, Core Motion).
  - `RasmaticClassic` (nuevo, sin Core Motion).
  - `RasmaticLugar3D` (heredado, intacto como respaldo).
- Los Swift compartidos son `AppDelegate.swift`, `GameViewController.swift` y
  `GamepadBridge.swift`. `HeadTrackingBridge.swift` **solo se compila en el
  target Head Tracking** (símbolo `RASMATIC_HEAD_TRACKING`).
- Cada target tiene su `Info.plist`, `Assets.xcassets`, `www`, bundle ID,
  display name, icono, esquema y producto `.app`.

### Persistencia aislada

| Dato | Head Tracking | Classic |
|---|---|---|
| Dificultad del bot | `rasmatic.botDifficulty` | `rasmatic.classic.botDifficulty` |
| Personalización V18 | `rasmatic.ui.v1` | `rasmatic.classic.ui.v1` |
| Ajustes VR | `rasmatic.vr.settings.v2` | `rasmatic.classic.vr.settings.v2` |
| Perfiles VR | `rasmatic.vr.profiles.v1` | `rasmatic.classic.vr.profiles.v1` |
| Enlace con Windows | `rasmatic.vr.link.v1` | `rasmatic.classic.vr.link.v1` |
| Joystick | `rasmatic.joystick` | `rasmatic.classic.joystick` |
| Head tracking | `rasmatic.ht.sensitivity`, `rasmatic.ht.smoothing` | no aplica |

Las claves se muestran sin prefijo; `RasmaticStore` las traduce. En la app
nativa cada app ya tiene su propio contenedor de WKWebView; el prefijo además
protege el caso de las dos PWA servidas desde el mismo origen.

---

## 2. Head Tracking real en iOS

### Tecnología elegida: Core Motion

- `CMMotionManager` + `CMDeviceMotion`.
- Se lee `CMAttitude` (`yaw`, `pitch`, `roll`) a **60 Hz**.
- Referencia `xArbitraryZVertical`: Z vertical y rumbo relativo al arranque.
  No usa magnetómetro (más estable en interiores).
- El puente nativo envía la orientación a JavaScript:

```js
window.RasmaticNativeHeadTracking.raw(yaw, pitch, roll)     // radianes
window.RasmaticNativeHeadTracking.status(disponible, nombre)
```

- El JS calcula la **diferencia con el punto de recentrado**, aplica
  sensibilidad y suavizado exponencial, y entrega un offset de render.
- **No se usa la cámara.** El `Info.plist` de Head Tracking no declara
  `NSCameraUsageDescription`.

### Por qué no ARKit

ARKit ofrece 6DoF con cámara y seguimiento posicional. Para este juego basta
3DoF de orientación (yaw/pitch/roll), que Core Motion entrega sin cámara, con
menos batería y en más modelos de iPhone. No se promete seguimiento
posicional de seis grados de libertad.

### Fallback web

La PWA (Safari/Android) usa `DeviceOrientationEvent`. En iOS 13+ el permiso se
pide con un gesto del usuario (`DeviceOrientationEvent.requestPermission()`).
En la app nativa no se pide ese permiso web: Core Motion entrega los datos
directamente y el sistema aplica su propio control de movimiento.

### Estados que ve el usuario

| Estado | Qué significa |
|---|---|
| `SIN SENSORES` | El dispositivo no expone orientación; no se simula nada. |
| `ACTIVAR HT` | Falta un toque para pedir permiso (PWA iOS). |
| `CONECTANDO…` | Se pidió el sensor y se esperan muestras. |
| `HT ACTIVO` | Llegan datos reales y la cámara responde. |
| `PERMISO DENEGADO` | El usuario rechazó el permiso de orientación. |
| `SIN RESPUESTA` | No llegaron muestras: sensor ausente o permiso bloqueado. |

### Controles

- Barra flotante `HEAD TRACKING` con `ACTIVAR` y `⟳ RECENTRAR`.
- Tecla **R**: recentra.
- En el panel VR: `ACTIVAR HT` y `Recentrar cabeza`.
- En Opciones (⚙): activar/desactivar, sensibilidad (0,2×–2,5×) y suavizado
  (0,03–0,45 s). Los valores se guardan.
- Al activar/desactivar el offset entra y sale con una mezcla suave, sin
  saltos bruscos.

### VR Box / SBS

El offset se aplica **solo durante el render**, en
`web/vr/vr-preview.js`:

1. Se parte de la cámara real del juego.
2. Se premultiplica el yaw sobre el eje vertical del mundo (horizonte estable).
3. Se multiplican pitch y roll locales.
4. Se renderiza cada ojo con su frustum off-axis y su IPD.
5. Se restaura la cámara original.

Por eso **no se toca** `PP.yaw`, `PP.pitch`, el estado, el IPD, la
convergencia ni la intensidad 3D. Las dos mitades SBS usan el mismo offset y
el HUD duplicado por ojo se mantiene.

---

## 3. Joystick opcional en las dos apps

Opción **JOYSTICK: ACTIVADO / DESACTIVADO** en ⚙.

- **Desactivado**: se oculta `#ras-stick`, se ignoran sus entradas y se
  sueltan las que estuvieran activas. CORRER, la cámara táctil, la interacción,
  el mando Bluetooth y el head tracking siguen funcionando.
- **Activado**: comportamiento actual.
- Se guarda en `rasmatic.joystick` o `rasmatic.classic.joystick` según la app.

El mando Bluetooth (GameController) **no se desactiva** con esta opción: es un
control independiente del joystick táctil.

---

## 4. Compilación

### Todo en Windows

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
```

Hace: iconos → `web/` + `web-classic/` → espejos iOS → paridad → check-xcode.

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

### Verificación de cada paquete

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

## 5. Instalación simultánea

Los bundle IDs son distintos, por lo que iOS las trata como apps separadas:

1. Firmar e instalar `RASMATIC-HeadTracking-unsigned.ipa` con Sideloadly,
   AltStore o Xcode.
2. Firmar e instalar `RASMATIC-Classic-unsigned.ipa` del mismo modo.
3. Las dos quedan en la pantalla de inicio con iconos distintos
   (banda azul `HT` / banda ámbar `CL`).
4. Actualizar o borrar una **no** modifica la otra.

Guía general: `docs/instalar-en-iphone.md`.

---

## 6. Pruebas realizadas

En este entorno (Windows, sin macOS/Xcode ni iPhone físico):

| Comprobación | Resultado |
|---|---|
| `node tools/check-xcode.js` | estructura de 3 targets, plists, permisos, iconos, esquemas y espejos |
| `node tools/check-parity.js` | núcleo idéntico; solo difieren identidad, manifest, sw e iconos |
| `node tools/test-web.js` | suite web V18/V19 sobre Head Tracking |
| `node tools/test-web.js --root web-classic` | misma suite sobre Classic |
| `node tools/test-vr.js` | VR/SBS, IPD, convergencia e intensidad 3D |
| `node tools/test-pad.js` | mando nativo GameController y VR |
| `node tools/test-v19.js` | head tracking nativo simulado, sensibilidad, suavizado, recentrado, joystick on/off, persistencia y aislamiento |

Los resultados concretos y capturas se guardan en `docs/evidencias/` y se
resumen en `docs/pruebas.md`.

### Lo que NO está validado

- **Compilación real y firma** de los `.ipa`: requieren macOS/Xcode o el
  runner de GitHub Actions.
- **Head Tracking físico**: no hay iPhone ni VR Box en este entorno. Las
  pruebas con datos simulados validan la lógica, no los sensores reales.
- **Permisos reales de iOS**: el prompt de movimiento y su denegación solo se
  pueden comprobar en un iPhone.
- **Instalación simultánea real**: se validan bundle IDs y artefactos, pero no
  se instalaron en un dispositivo físico.
- **Legibilidad dentro de las VR Box**: depende del visor y del iPhone.

No se afirma que el head tracking esté validado físicamente.

---

## 7. Archivos clave

| Archivo | Función |
|---|---|
| `tools/build-ios.js` | genera `web/` y `web-classic/` + espejos iOS |
| `tools/make-icons.ps1` | iconos HT/CL y Assets.xcassets |
| `tools/check-parity.js` | compara el núcleo de las dos apps |
| `tools/check-xcode.js` | valida targets, plists, permisos y compilación |
| `tools/build-ipa.sh` | compila los dos `.ipa` |
| `tools/verify-ipa.js` | verifica cada `.ipa` y su variante |
| `.github/workflows/ios-ipa.yml` | build en la nube |
| `web/headtracking/head-tracking.js` | consumo nativo/web, suavizado y UI |
| `web/vr/vr-preview.js` | aplica el offset al render SBS |
| `ios/RasmaticLugar3D/HeadTrackingBridge.swift` | Core Motion → JS |
| `ios/RasmaticLugar3D/GameViewController.swift` | variante, permisos y puentes |
| `ios/RasmaticHeadTracking/Info.plist` | `NSMotionUsageDescription` |
| `ios/RasmaticClassic/Info.plist` | sin permisos de sensores |

---

## 8. Estado de los artefactos web (V19)

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `web/index.html` (Head Tracking) | 267.542 | `8E71ED2F2C46EFBFB598A9CA4FABE64212A1F8D725D73790F7C1D5663BF65755` |
| `web-classic/index.html` (Classic) | 267.445 | `873C357B48ADD1529285B71045981447A539DA9862FDADD3935EC866D60602A3` |
| `web/mobile/game.js` | — | `87F8C95613A40A655914774C21A3FA554633DD21B159366A720A5D6E12CBAD80` |
| `web/mobile/android-bridge.js` | — | `4616998E560CD69C85BE918963BFAA61049A6E29C9152EFD843195E1AB9D297A` |
| `web/mobile/android-game.css` | — | `58D66AE44655BE7D0EA638371A5FB7116296D0FE764EABE493D50C4EF1A18572` |
| `web/mobile/android-controls.css` | — | `29C186FA2ADE2F4896BD8A4B664E372531ADF1574A050D5EE1AA5791D228C180` |
| `web/vr/vr-preview.js` | — | `F7477F9237EC783871CA8348BA1A8C48893BBAE2D290AD68C904A3F73C4CDD7E` |
| `web/headtracking/head-tracking.js` | — | `B0FAA62EE144771C6AAEFD9FCA51212F0E94F7E56196F34F7993BA17370A5676` |
| `web/headtracking/head-tracking.css` | — | `45716AC89F69A7A24A710C795BC508A17BDF4BB6595C46E6F3BE7B1E8E8E0721` |

Service workers:

- Head Tracking: `rasmatic-ht-fc6b79f9fb4d80d7`
- Classic: `rasmatic-classic-c1476918ab3dacc5`

Estos hashes corresponden a la compilación local del 26/11/2026. Los `.ipa`
reales se generan en macOS y su SHA-256 lo imprime `tools/build-ipa.sh` y el
flujo de GitHub Actions.
