# RASMATIC · Lugar 3D — versión iPhone (V19)

Port del juego Android **RASMATIC · Lugar 3D** en **dos apps iOS independientes**
que se pueden instalar a la vez:

| App | Bundle ID | Artefacto |
|---|---|---|
| **RASMATIC VR HEAD TRACKING** | `com.rasmatic.lugar3d.headtracking` | `dist/RASMATIC-HeadTracking-unsigned.ipa` |
| **RASMATIC VR CLASSIC** | `com.rasmatic.lugar3d.classic` | `dist/RASMATIC-Classic-unsigned.ipa` |

El juego en sí (escena 3D, HUD, estaciones, CNC, bot, partida de 3 minutos) es
**exactamente el mismo código** en las dos: se copia byte a byte desde el
proyecto Android. La única diferencia funcional obligatoria es el **head
tracking real** de la versión Head Tracking; las dos comparten la opción
**JOYSTICK: ACTIVADO / DESACTIVADO**.

- Head Tracking usa **Core Motion** (`CMMotionManager` / `CMDeviceMotion`) en
  iOS, sin cámara, con permiso `NSMotionUsageDescription`.
- Classic **no** compila Core Motion, no incluye `headtracking/` y no declara
  permisos de sensores.
- Cada app tiene su propio almacenamiento (`rasmatic.*` vs
  `rasmatic.classic.*`), icono, manifest, service worker y bundle ID.

Detalle completo: **`docs/v19-dos-apps.md`**.

---

## Formas de jugarlo

| | Qué es | Qué necesitás | Offline |
|---|---|---|---|
| **A. App nativa** (lo que buscás) | Proyecto Xcode con el juego adentro (WKWebView). Se instala en el iPhone: icono propio, pantalla completa, sin Safari y sin la PC | macOS para compilar (propia, prestada o **en la nube**) + cuenta Apple | Sí, siempre |
| **B. PWA** (solo para probar ya) | El juego servido como sitio web y agregado a la pantalla de inicio | Una PC en la misma red Wi-Fi que el iPhone | Solo por https o desde la PC |

Para la app nativa, **no hace falta comprar una Mac**: `docs/instalar-en-iphone.md`
explica las cuatro formas de compilarla e instalarla (Mac alquilada por hora,
build gratis en GitHub Actions + AltStore/Sideloadly, TestFlight, o la PWA como
último recurso).

`web/` y `ios/RasmaticHeadTracking/www` son idénticos byte a byte, igual que
`web-classic/` y `ios/RasmaticClassic/www` (lo verifican `tools/check-xcode.js`
y `tools/check-parity.js`).

### Dificultad del bot

El bot que atiende clientes juega más lento que antes (un cliente cada 9 s en
**Normal**). En el vestíbulo, antes de empezar, el botón **⚙** abre
**Dificultad del bot**:

| Nivel | Cliente cada | Velocidad del CNC |
|---|---|---|
| Fácil | 12 s | 0,75× (más lento) |
| Normal | 9 s | 1× |
| Difícil | 6 s | 1,25× (más rápido) |

La elección se guarda en el iPhone (`localStorage`, clave
`rasmatic.botDifficulty`) y se aplica sin reiniciar la escena. También se puede
cambiar por código con `RasmaticGame.setDifficulty('facil'|'normal'|'dificil')`
y consultar con `RasmaticGame.getDifficulty()`. El juego sigue siendo el mismo:
solo cambian los tiempos del bot, no las reglas ni el control Bluetooth.

---

## A. Instalar la app en el iPhone

La guía completa está en **`docs/instalar-en-iphone.md`**: cuatro formas, con
costos, límites de Apple y solución de problemas.

La más rápida **sin tener Mac**:

1. Subir esta carpeta a un repositorio de GitHub (gratis; si es público, la
   compilación no consume minutos).
2. Pestaña **Actions** → *iOS apps V19 (dos .ipa sin firmar)* → **Run workflow**.
3. Al terminar (~15 min), descargar el artefacto `rasmatic-v19-ipas`: adentro
   están `RASMATIC-HeadTracking-unsigned.ipa` y
   `RASMATIC-Classic-unsigned.ipa`.
4. Instalar **cada una** desde Windows con **Sideloadly** o **AltStore**,
   firmando con tu Apple ID (cuenta gratis sirve).

Resultado: las dos apps quedan instaladas a la vez, con iconos distintos
(banda azul `HT` / banda ámbar `CL`), abren a pantalla completa, no usan Safari
y funcionan **sin internet y sin la PC**. Con cuenta gratis la firma dura 7 días
(se renueva en 30 segundos); con TestFlight, 90 días por versión.

Los `.ipa` los produce `tools/build-ipa.sh`, el mismo script que se usa en una Mac:

```bash
./tools/build-ipa.sh
# dist/RASMATIC-HeadTracking-unsigned.ipa
# dist/RASMATIC-Classic-unsigned.ipa
```

Y si preferís no usar la web de GitHub, `tools/publish-github.js` hace todo por
API (crear repo, subir, compilar, esperar y bajar el `.ipa`) con un token:

```powershell
node tools/publish-github.js --token-file C:\ruta\al\token.txt
```

---

## B. Probarlo como PWA mientras tanto (sin Mac ni cuenta)

1. En la PC, desde esta carpeta:

   ```powershell
   node tools/serve.js
   ```

   El script imprime algo así:

   ```
   local  : http://localhost:8080/
   LAN    : http://192.168.0.42:8080/   (abrir en el iPhone)
   ```

2. En el iPhone, con Safari, abrir la dirección **LAN** que imprimió.
   (La PC y el iPhone tienen que estar en la misma red Wi-Fi. Si Windows
   pregunta por el Firewall, permitir Node en redes privadas.)

   > No abras `web/index.html` con doble clic: con `file://` el navegador
   > bloquea las fuentes y la escena queda sin tipografía. Usá el servidor.

3. Jugar. Para dejarlo como app:

   **Compartir** (cuadrado con flecha) → **Añadir a pantalla de inicio** →
   **Añadir**. Queda el icono RASMATIC y abre a pantalla completa, sin barras
   del navegador.

Para que funcione **sin conexión** desde el iPhone hay dos caminos:

- Usar la app nativa (opción A), que lleva todo adentro; o
- Servir el sitio por **https** (los service workers solo se habilitan en
  https o en `localhost`). Al abrirlo por IP LAN el juego funciona igual, pero
  necesita que la PC esté encendida.

---

## C. Compilar la app nativa con una Mac

Si tenés acceso a una Mac (propia, prestada o alquilada por hora), es el camino
más directo. El proyecto está en `ios/` y ya incluye el juego dentro.

1. Copiar la carpeta `ios/` a la Mac (o todo el proyecto).
2. Abrir `ios/RasmaticLugar3D.xcodeproj` con Xcode 15 o posterior.
3. En **Signing & Capabilities**, elegir tu equipo (Apple ID). El *bundle id*
   es `com.rasmatic.lugar3d`; si Xcode se queja porque ya existe, cambialo por
   uno propio.
4. Conectar el iPhone y ejecutar (▶).

Requisitos: iOS 15 o posterior. La app no usa red, ni cámara, ni
almacenamiento: es el juego y nada más.

### Cómo carga el juego la app

`GameViewController.swift` registra un esquema propio (`rasmatic://app/…`) con
`WKURLSchemeHandler` y sirve los archivos del bundle. Se hizo así, y no con
`file://`, porque `file://` bloquea las fuentes `@font-face` y algunos recursos
por CORS: la escena quedaba sin tipografía. Con el esquema propio el juego se
comporta igual que en Safari, sin tocar una línea del código del juego.

---

## Qué es idéntico y qué no

Idéntico (mismo código, copiado byte a byte):

- La escena 3D, el recorrido, las góndolas, el logo y el CNC.
- El HUD: marcador jugador/bot, reloj de 3:00, pedido, “llevás”, avisos.
- Las 6 estaciones de colores, el encargado, el cliente y el bot.
- El joystick táctil, el arrastre para mirar y la cámara.
- La partida de 3 minutos, el bot con el CNC, el resultado y “volver a jugar”.
- El mando físico, con el mismo mapeo que Android (ver `docs/paridad.md`).

La **UI de gameplay** también es la misma en Android y iPhone: en la fase V17 se
rediseñó en las dos copias (áreas seguras, columna del HUD, JUGAR centrado,
tipografía y resultado), y en VR se dibuja 1:1 dentro de cada ojo. En la fase V18
se añadió la **personalización de interfaz** (tamaño, posición, grosor, contraste
y fondo por elemento, con perfiles normal y VR) desde Opciones → **PERSONALIZACIÓN
DE INTERFAZ**. Detalle en `docs/ui-gameplay.md` y `docs/ui-personalization.md`.

Diferencias, todas deliberadas y explicadas en `docs/paridad.md`:

- **No hay botón “Salir”** en el menú de pausa: iOS no permite cerrar una app
  por código, así que el botón se oculta en vez de mostrar una acción muerta.
- **En la partida, B/Start del mando hace lo que el botón Atrás de Android**
  (confirmar salida / volver a jugar al terminar). En Android ese botón es
  físico; en iPhone no existe.
- El icono es el mismo de Android (192 px), ampliado a 180/512/1024 para la
  pantalla de inicio. Se ve igual, con algo menos de nitidez en tamaños grandes.
- **Modo VR BOX** (iPhone y Windows): estéreo real con dos cámaras, HUD y menús
  dentro de cada ojo, para jugar con el teléfono dentro de unas VR Box. En
  Windows hay además una vista previa con perfiles de pantalla, IPD y
  distorsión. No cambia el juego ni los controles. Ver más abajo.

---

## D. Jugar con VR Box (iPhone) y verlo en Windows

El juego incluye un modo estéreo real: dos cámaras (una por ojo) con frustums
asimétricos *off-axis*, HUD y menús dibujados dentro de cada ojo, IPD,
convergencia, FOV, tamaño, separación y distorsión de lente aproximada.

**En el iPhone** (el uso real):

1. Conectar el mando por Bluetooth (ver `docs/mando-bluetooth.md`).
2. Tocar **VR BOX** arriba al centro, o la **X** del mando.
3. Girar el iPhone a horizontal y ponerlo en las VR Box.
4. Ajustar IPD/convergencia desde el panel si hace falta.
5. Para salir: botón **Salir (Esc)** del panel o **VR BOX** de nuevo. La salida
   queda dentro del ojo izquierdo, así que no te quedás atrapado.

**En Windows** (vista previa):

```powershell
node tools/serve.js --port 8080
```

Abrir `http://127.0.0.1:8080/index.html`, pulsar el botón **VR BOX** (o la tecla
`V`, o abrir `index.html?vr=1`). `H` muestra/oculta el panel, `Esc` sale.

Controles de prueba en Windows: `WASD` mover, mouse girar, `Shift` correr,
`Espacio` interactuar. El mando real sigue conectándose por Bluetooth al iPhone,
no a la PC.

Guía completa, ajustes, pruebas y limitaciones: **`docs/vr-box-preview.md`**.

---

## Estructura

```
Juego3d-iPhone/
  .github/workflows/       compila el .ipa en la nube (sin Mac)
  web/                     sitio PWA (lo que sirve tools/serve.js)
    index.html             generado desde el index.html de Android
    mobile/                game.js, modes.js, android-bridge.js, CSS (copias)
    ios/ios.css            ajustes de iOS (safe areas, 100dvh, sin zoom)
    ios/ios-bridge.js      mando (puente nativo + Gamepad API) y detalles de Safari
    vr/vr-preview.js       modo VR BOX (estéreo iPhone/Windows, HUD por ojo)
    vr/vr-preview.css      botón, panel, guías y viñeta del modo VR
    fonts/                 fuentes locales (woff2)
    icons/                 iconos 180/192/512/1024
    manifest.webmanifest   para “Añadir a pantalla de inicio”
    sw.js                  cache offline (generado, versionado)
  ios/                     proyecto Xcode (la app)
    RasmaticLugar3D.xcodeproj
    RasmaticLugar3D/       Swift (incl. GamepadBridge.swift), Info.plist, Assets.xcassets y www/
  tools/                   generación, verificación, pruebas y build-ipa.sh
  docs/                    paridad, pruebas, instalación, mando, firma y evidencias
```

---

## Reconstruir / volver a generar

El `index.html` de iPhone **no se edita a mano**: se genera desde el de Android
con reemplazos verificables. Para regenerar todo:

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
```

Eso hace, en orden:

1. `tools/make-icons.ps1` — iconos de PWA y de la app a partir del icono de
   Android (`mipmap-xxxhdpi/ic_launcher.png`).
2. `tools/build-ios.js` — copia el juego, genera `web/index.html`,
   `manifest.webmanifest` y `sw.js`, y espeja todo a `ios/RasmaticLugar3D/www`.
3. `tools/check-xcode.js` - 123 comprobaciones: proyecto, plist, iconos, espejo,
   recursos, mando nativo y el flujo de compilación del `.ipa`.

Si el proyecto Android está en otra ruta:

```powershell
node tools/build-ios.js --source "D:/ruta/android/app/src/main/assets/www"
```

Para llevarte todo en un ZIP (por ejemplo a la Mac):

```powershell
powershell -ExecutionPolicy Bypass -File tools/package.ps1
```

Genera `dist/RASMATIC-Lugar3D-iPhone-<fecha>.zip` e imprime tamaño y SHA-256.
El hash también queda en `dist/<zip>.sha256` (al lado del ZIP, no dentro, para
que el archivo no tenga que contener su propio hash). Para comprobarlo:

```powershell
Get-FileHash dist\RASMATIC-Lugar3D-iPhone-<fecha>.zip -Algorithm SHA256
Get-Content dist\RASMATIC-Lugar3D-iPhone-<fecha>.zip.sha256
```

---

## Pruebas

```powershell
node tools/test-web.js
```

Abre un Chromium real simulando un iPhone (390×844, táctil, DPR 1 para las
pruebas), juega la partida y verifica **30 casos** (arranque, HUD, cliente,
recoger/entregar, entrega incorrecta, CNC, fin de partida, revancha, joystick,
cámara, pausa en segundo plano, mando, safe areas, metadatos, service worker,
dificultad del bot, layout de JUGAR/textos y personalización de interfaz), más
una recarga **sin conexión** y una comprobación en **horizontal**. Además guarda
capturas en `docs/evidencias/`.

Resultado de la última ejecución: **30/30 + offline**, consola sin errores.

El modo VR tiene su propia suite de escritorio:

```powershell
node tools/test-vr.js
```

**34/34 casos** (estéreo real, IPD, convergencia, perfiles, HUD por ojo y plano,
JUGAR espejado, distorsión, WASD/Shift/Espacio/Escape, restauración al salir,
personalización VR duplicada 1:1 y no regresión del juego), más mouse con eventos
reales y arranque con `?vr=1`.

El mando nativo y el VR móvil se prueban con un iPhone simulado:

```powershell
node tools/test-pad.js
```

**21/21 casos**: inyecta `__RASMATIC_NATIVE__` antes de cargar la página (igual
que `GameViewController.swift`), y comprueba sticks, cámara, correr 2,4×,
A/B/X/Y/Select, desconexión/reconexión, ausencia de doble entrada, ocultado del
joystick, VR por ojo, aviso de rotación y salida segura.

La suite V19 prueba las dos apps por separado, el joystick, el aislamiento de
persistencia y el head tracking nativo simulado + fallback web:

```powershell
node tools/test-v19.js
```

**16/16 Head Tracking nativo**, **14/14 Classic**, **16/16 Head Tracking web**
y persistencia independiente (`rasmatic.*` on / `rasmatic.classic.*` off).

La estructura del proyecto iOS y la paridad del núcleo se verifican sin Mac:

```powershell
node tools/check-xcode.js         # 246 comprobaciones
node tools/check-parity.js        # 44 comprobaciones
node tools/verify-ipa.js dist/RASMATIC-HeadTracking-unsigned.ipa \
  --expect com.rasmatic.lugar3d.headtracking --variant headtracking
node tools/verify-ipa.js dist/RASMATIC-Classic-unsigned.ipa \
  --expect com.rasmatic.lugar3d.classic --variant classic
```

> Importante: esto corre en Chromium, no en Safari. Lo que solo se puede
> comprobar en un iPhone real está listado al final de `docs/pruebas.md`.

---

## Documentación

- `docs/v19-dos-apps.md` — **V19**: las dos apps, Core Motion, permisos,
  bundle IDs, almacenamiento aislado, joystick, compilación y limitaciones.
- `docs/paridad.md` — equivalencia con Android, archivo por archivo, y las
  diferencias con su justificación.
- `docs/pruebas.md` — matriz de pruebas por entorno, resultados, evidencias y lo
  que no se pudo verificar (Safari, Xcode, iPhone, mando y VR físicos).
- `docs/mando-bluetooth.md` — emparejar el mando con iOS, mapeo exacto, puente
  `GameController`, reconexión y problemas frecuentes.
- `docs/vr-box-preview.md` — modo VR en el iPhone y vista previa en Windows:
  controles, ajustes, cómo funciona el estéreo, pruebas y limitaciones.
- `docs/ui-gameplay.md` — rediseño de la UI durante la partida: diagnóstico,
  sistema de áreas seguras, JUGAR centrado, adaptación SBS y elementos intactos.
- `docs/ui-personalization.md` — panel **PERSONALIZACIÓN DE INTERFAZ**: elementos,
  controles, perfiles normal/VR, persistencia y API pública.
- `docs/instalar-en-iphone.md` — guía de 11 pasos por USB en Windows, las otras
  formas de instalar, costos, límites de Apple y problemas frecuentes.
- `docs/firma-y-requisitos.md` — qué significa “sin firmar”, requisitos por
  etapa, bundle id, seguridad y estado real de la entrega.

---

## Estado de la entrega

| | |
|---|---|
| Juego copiado del APK Android | 6 archivos + 13 fuentes, SHA-256 idéntico en las dos apps |
| `web/index.html` (Head Tracking) | generado con variante, `headTracking: true` y prefijo `rasmatic.` |
| `web-classic/index.html` (Classic) | generado con `headTracking: false` y prefijo `rasmatic.classic.` |
| Verificación del proyecto iOS | 246/246 comprobaciones |
| Paridad del núcleo | 44/44 comprobaciones |
| Pruebas funcionales Head Tracking | 30/30 + offline + horizontal |
| Pruebas funcionales Classic | 30/30 + offline + horizontal |
| Pruebas del modo VR (escritorio, ambas) | 34/34 + mouse + `?vr=1` |
| Pruebas de mando nativo y VR móvil (ambas) | 21/21 |
| Suite V19 (head tracking, joystick, aislamiento) | HT nativo 16/16 · Classic 14/14 · HT web 16/16 |
| Iconos | HT con banda azul `HT`, Classic con banda ámbar `CL` |
| Instalador Windows | `windows-calibrator/release/RASMATIC VR Calibrator Setup 1.0.0.exe` · smoke 14/14 |
| Verificador de `.ipa` | estructura, Mach-O, bundle id, permisos por variante y juego completo |
| ZIP para llevar a la Mac | `dist/RASMATIC-Lugar3D-iPhone-<fecha>.zip` · hash en `dist/<zip>.sha256` |
| `.ipa` compilados y firmados | **pendiente**: requieren runner macOS y una cuenta Apple |
| Head Tracking físico / sensores reales | **pendiente**: requiere iPhone real y VR Box |

Pendiente (requiere hardware Apple): compilar en Xcode, generar el `.ipa`,
firmarlo, instalarlo, abrir en Safari/WKWebView real, probar un mando Bluetooth
real y las VR Box físicas. Ver `docs/pruebas.md` § “Lo que NO se pudo verificar
acá”.
