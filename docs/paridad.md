# Paridad con la versión Android

Este documento responde a una pregunta concreta: **¿el juego del iPhone es el
mismo que el de Android?** La respuesta corta es sí: el juego es el mismo
código, copiado byte a byte. Lo que cambia es la cáscara que lo abre.

Origen: `Juego3d/android/app/src/main/assets/www` (proyecto Android terminado).

---

## 1. Archivos del juego: copias idénticas

SHA-256 calculado sobre los archivos ya copiados en `web/`.

| Archivo en `web/` | Origen Android | Bytes | SHA-256 | Estado |
|---|---|---:|---|---|
| `mobile/game.js` | `android/game.js` | 65.083 | `EE2E52A65F3E72365E8769F7FD04B4705033958A90A0C99B9612705267143A0A` | idéntico |
| `mobile/modes.js` | `android/modes.js` | 2.497 | `8E71096D65246CFAE857C194E536861A02E17EF249B76092FEFF7E11E90C1B04` | idéntico |
| `mobile/android-bridge.js` | `android/android-bridge.js` | 23.014 | `AFC32D1857B03C69D547A7E5332EEEE3A54548438781FC71DE79D91005E68A8D` | idéntico |
| `mobile/android-game.css` | `android/android-game.css` | 33.997 | `7E4E2ED83B09D23A750B80ED3573D2EA44F283AC3CAECBC14F8E83FD3C443183` | idéntico |
| `mobile/android-controls.css` | `android/android-controls.css` | 10.864 | `0B482B7A63AF4462614E50E9F190B5F58EDFCCBFDC45229C43EDEF7B2991B7AE` | idéntico |
| `three.min.js` | `three.min.js` | 603.445 | `9274BBCEC8D96168626C732B5D31C775AA8CFB7EAA0599BEC0C175908A2C1CE2` | idéntico |
| `fonts/` (13 archivos) | `fonts/` | 13 de 13 | — | idénticos |

Los cinco archivos de `mobile/` son los mismos que el APK carga desde
`android/`. Se renombró la **carpeta** porque `android/` no describe nada en un
iPhone; ningún JS ni CSS referencia esa ruta internamente (verificado: cero
apariciones de `android/` dentro de esos cinco archivos).

### index.html

| | Bytes | SHA-256 |
|---|---:|---|
| Android (`assets/www/index.html`) | 264.776 | `91D78F71E7FE22EE8C30B0E501EE4F89CBE06E0C19C3934827A5E3D9F509CCBC` |
| iPhone (`web/index.html`) | 266.213 | `526F91094276B4001DB26518AE3C2D03B3B914C217321FE5568AC0A9ABEAD367` |

El de iPhone **se genera** con `tools/build-ios.js` desde el de Android. Si un
reemplazo no coincide exactamente, el script falla: no puede producir una copia
divergente en silencio.

Los 8 reemplazos:

| # | Qué | Antes | Después |
|---|---|---|---|
| 1 | viewport | `width=device-width, initial-scale=1, viewport-fit=cover` | agrega `maximum-scale=1` (evita el zoom de pellizco) |
| 2 | metadatos | `</title>` | + `apple-mobile-web-app-*`, `theme-color`, `manifest`, `apple-touch-icon`, iconos |
| 3 | CSS de controles | `android/android-controls.css` | `mobile/android-controls.css` + `ios/ios.css` + `vr/vr-preview.css` |
| 4 | CSS del juego | `android/android-game.css` | `mobile/android-game.css` |
| 5 | script modos | `android/modes.js` | `mobile/modes.js` |
| 6 | script puente | `android/android-bridge.js` | `mobile/android-bridge.js` |
| 7 | script juego | `android/game.js` | `mobile/game.js` + `ios/ios-bridge.js` + `vr/vr-preview.js` + registro del service worker |
| 8 | comentario | `lo maneja android/game.js` | `lo maneja mobile/game.js` (solo texto) |

Nada más se toca: la escena, el HUD, la partida, el CNC y el bot son el mismo
código que ya se verificó en el APK.

---

## 2. Comportamiento

| Función | Android | iPhone (PWA y app) |
|---|---|---|
| Escena 3D, recorrido, logo, CNC | `game.js` | igual |
| HUD (marcador, reloj, pedido, “llevás”) | `game.js` | igual |
| Partida de 3 minutos | `CFG.duration` | igual |
| 6 estaciones, encargado, cliente, bot | `game.js` | igual |
| Joystick táctil | `android-bridge.js` | igual (mismo archivo) |
| Arrastrar para mirar | `game.js` | igual |
| Pausa al pasar a segundo plano | Kotlin → `RasmaticAndroid.onAppPause` | `visibilitychange` (ya lo hace el mismo puente) |
| Pantalla siempre encendida | `FLAG_KEEP_SCREEN_ON` | app: `isIdleTimerDisabled`; PWA: Screen Wake Lock |
| Mando físico: sticks | `GamepadManager.kt` → `RasmaticInput.gamepad` | app: `GamepadBridge.swift` (GameController) → `RasmaticNativeGamepad.raw` → `RasmaticInput.gamepad`; Safari/PWA: Gamepad API |
| Mando físico: botones | `GamepadManager.kt` → `RasmaticInput.press` | app: `GamepadBridge.swift` → `RasmaticNativeGamepad.press` → `RasmaticInput.press`; Safari/PWA: Gamepad API |
| Zona segura (notch, barra de gestos) | `env(safe-area-inset-*)` | igual, más `100dvh` |
| “Volver a jugar” | botón | igual |
| Guardar video de la partida | `RasmaticSaveVideo` (sin uso en el juego) | no disponible (el juego no lo llama) |

### Mapeo del mando

Idéntico al de `GamepadManager.kt`:

| Entrada | Acción |
|---|---|
| Stick izquierdo / cruceta | mover |
| Stick derecho | mirar |
| A, R1, R2 | interactuar |
| L1, L2 (o gatillo a fondo) | correr |
| B, Start | pausa / atrás (ver diferencia 2) |
| X | panel VR en iOS / menú de destinos en Android |
| Y | volver al inicio |
| Select | abrir/cerrar el menú de destinos |

En la app iOS el mando se lee con `GameController` y se entrega al JavaScript
por la misma superficie que usa Android (`RasmaticInput`), así que el juego no
cambia. En Safari/PWA se usa la Gamepad API. El marcador
`__RASMATIC_NATIVE__` hace que solo uno de los dos caminos esté activo: no hay
doble entrada. Detalle en `docs/mando-bluetooth.md`.

---

## 3. Diferencias deliberadas

### 3.1 No hay botón “Salir”

En Android, el menú de pausa tiene **Salir** y llama a `native.exitApp()`. iOS
no permite que una app se cierre por código (ni Safari puede cerrar la pestaña
sin interacción del usuario). En vez de dejar un botón que no hace nada, se
oculta con CSS:

```css
html.ras-ios #ras-pause [data-act="exit"] { display: none !important; }
```

El resto del menú (Reanudar, Volver al inicio, modos) queda igual.

En la práctica, durante la partida el menú de pausa no se abre: el juego lo
bloquea a propósito (`openPause()` retorna si `inArena()`), porque la partida no
usa ese menú. La regla CSS queda como respaldo por si se abre en el lobby o en
una versión futura.

### 3.2 B/Start del mando hace de “Atrás” en la partida

En Android, dentro de la partida, el mando no puede volver: para eso está el
botón físico Atrás del teléfono (`RasmaticAndroid.onBack()`). Un iPhone no
tiene ese botón, así que en la partida B/Start se envía al mismo manejador:

- en `playing`: pide confirmación (“Tocá atrás otra vez para salir”);
- en `over`: vuelve al inicio.

Fuera de la partida, B/Start es “pausa”, igual que en Android.

### 3.3 Icono

Se reutiliza el icono heredado de Android (`mipmap-xxxhdpi/ic_launcher.png`,
192 px) y se generan 180/192/512/1024 con interpolación bicúbica. Es el mismo
arte; los tamaños grandes se ven algo más suaves que si existiera un original
vectorial. Los iconos de la app iOS se guardan sin canal alfa (requisito de la
App Store).

### 3.4 Offline

- App nativa: todo va dentro del bundle, funciona siempre sin red.
- PWA: el service worker cachea el juego, pero los navegadores solo lo habilitan
  en **https** o `localhost`. Abierto por IP LAN funciona online; instalado y
  servido por https funciona offline.

---

## 4. Lo que no se tocó

- `modes.js`, `android-bridge.js`, `android-controls.css` y
  `GamepadManager.kt`: sin cambios.
- La mecánica del juego (reglas, puntaje, controles Bluetooth, cámara, SBS):
  sin cambios.
- `game.js` y `android-game.css` **sí** cambiaron en esta fase, en las dos
  copias: dificultad del bot (fácil/normal/difícil, persistida en
  `localStorage`) con su panel de opciones, y el logo del vestíbulo se oculta
  al arrancar la partida. Los tiempos del bot pasan por `botTime()`; no se
  tocaron reglas, puntaje ni entrada.
- En la fase V17 se renovó la **UI de gameplay** (safe areas, columna del HUD,
  JUGAR centrado, tipografía y panel de resultado) en `android-game.css`, y
  `game.js` solo envolvió los paneles en `#rg-left` (mismos ids). No cambian
  mecánicas, cámara, SBS, IPD ni convergencia. Detalle en
  `docs/ui-gameplay.md`.
- En la fase V18 se agregó la **personalización de interfaz** (tamaño, posición,
  grosor, contraste y fondo por elemento, perfiles normal/VR y persistencia
  versionada) en `game.js` y `android-game.css`. Solo cambia cómo se pinta el
  HUD: no toca reglas, puntaje, bot, dificultades, cámara, SBS, IPD ni
  convergencia. Detalle en `docs/ui-personalization.md`.
- El `index.html` de Android: se restauró el arreglo del logo (`logoBubble`,
  `setLogo`, `logo` en `RasmaticCore.game`) y en `start()` se oculta el logo si
  la partida ya está activa; el generador solo lo lee.

`web/ios/ios-bridge.js` **sí se amplió** en esta fase: puente nativo
`RasmaticNativeGamepad`, aviso de conexión/desconexión y **X** abriendo el panel
VR. Sigue usando la misma superficie pública (`RasmaticInput`), así que el juego
no se toca. `web/vr/` es nuevo.

### 4.1 El modo VR es una capa extra

`web/vr/` **no existe en Android**: es una herramienta de este port para jugar
con el iPhone dentro de unas VR Box y, en Windows, para previsualizarlo. Se
limita a interceptar `renderer.render` cuando está activo; con el modo apagado
el render es exactamente el original.

En iPhone/iPad el botón **VR BOX** está disponible (es el uso real), y el mando
**X** abre el panel. En Android no hay equivalente. Detalle en
`docs/vr-box-preview.md`.

### 4.2 El mando nativo tampoco existe en Android

Android usa `GamepadManager.kt` con `KeyEvent`/`MotionEvent`. iOS no tiene ese
modelo: la app usa `GameController` (`GamepadBridge.swift`) y entrega los mismos
valores por `RasmaticNativeGamepad`. El mapeo es idéntico, incluida la zona
muerta 0,18 y el gatillo 0,5. La diferencia es de plataforma, no de juego.
Detalle en `docs/mando-bluetooth.md`.

### 4.3 V19: dos apps con el mismo núcleo

Desde V19 el proyecto genera dos sitios y dos apps:

| | Head Tracking | Classic |
|---|---|---|
| Núcleo `game.js`, `modes.js`, `android-bridge.js`, CSS, `three.js` | idéntico | idéntico |
| `vr/`, `net/`, `ios/` | idéntico | idéntico |
| `headtracking/` | sí | no |
| Bundle ID | `com.rasmatic.lugar3d.headtracking` | `com.rasmatic.lugar3d.classic` |
| Almacenamiento | `rasmatic.*` | `rasmatic.classic.*` |
| Core Motion | sí (3DoF) | no |
| `NSMotionUsageDescription` | sí | no |
| Icono | banda azul `HT` | banda ámbar `CL` |

`tools/check-parity.js` compara el núcleo archivo por archivo. Solo permite
diferencias en `index.html`, `manifest.webmanifest`, `sw.js`, `icons/*` y la
carpeta `headtracking/`. Cualquier cambio futuro en el juego que se aplique a
una sola variante falla la comprobación.

La app heredada `RasmaticLugar3D` (`com.rasmatic.lugar3d`) sigue en el proyecto
como respaldo V18 y no se compila por defecto.

Detalle completo en `docs/v19-dos-apps.md`.
