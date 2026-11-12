# RASMATIC · Lugar 3D — versión iPhone

Port del juego Android **RASMATIC · Lugar 3D** para que lo pueda jugar alguien
con iPhone, con el mismo contenido y el mismo comportamiento.

El juego en sí (escena 3D, HUD, estaciones, CNC, bot, partida de 3 minutos) es
**exactamente el mismo código** del proyecto Android: los archivos del juego se
copian byte a byte. Lo único que cambia es la capa que lo envuelve: en Android
es una app Kotlin con WebView; acá hay dos formas de abrirlo en un iPhone.

---

## Dos formas de jugarlo

| | Qué es | Qué necesitás | Offline |
|---|---|---|---|
| **A. App nativa** (lo que buscás) | Proyecto Xcode con el juego adentro (WKWebView). Se instala en el iPhone: icono propio, pantalla completa, sin Safari y sin la PC | macOS para compilar (propia, prestada o **en la nube**) + cuenta Apple | Sí, siempre |
| **B. PWA** (solo para probar ya) | El juego servido como sitio web y agregado a la pantalla de inicio | Una PC en la misma red Wi-Fi que el iPhone | Solo por https o desde la PC |

Para la app nativa, **no hace falta comprar una Mac**: `docs/instalar-en-iphone.md`
explica las cuatro formas de compilarla e instalarla (Mac alquilada por hora,
build gratis en GitHub Actions + AltStore/Sideloadly, TestFlight, o la PWA como
último recurso).

Las dos usan el mismo contenido: `web/` y `ios/RasmaticLugar3D/www/` son
idénticos byte a byte (lo verifica `tools/check-xcode.js`).

---

## A. Instalar la app en el iPhone

La guía completa está en **`docs/instalar-en-iphone.md`**: cuatro formas, con
costos, límites de Apple y solución de problemas.

La más rápida **sin tener Mac**:

1. Subir esta carpeta a un repositorio de GitHub (gratis; si es público, la
   compilación no consume minutos).
2. Pestaña **Actions** → *iOS app (ipa sin firmar)* → **Run workflow**.
3. Al terminar (~10 min), descargar el artefacto `RasmaticLugar3D-ipa`: adentro
   está `RasmaticLugar3D-unsigned.ipa`.
4. Instalarlo desde Windows con **Sideloadly** o **AltStore**, firmando con tu
   Apple ID (cuenta gratis sirve).

Resultado: la app queda instalada con su icono, abre a pantalla completa, no
usa Safari y funciona **sin internet y sin la PC**. Con cuenta gratis la firma
dura 7 días (se renueva en 30 segundos); con TestFlight, 90 días por versión.

El `.ipa` lo produce `tools/build-ipa.sh`, el mismo script que se usa en una Mac:

```bash
./tools/build-ipa.sh     # deja dist/RasmaticLugar3D-unsigned.ipa
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
3. `tools/check-xcode.js` - 118 comprobaciones: proyecto, plist, iconos, espejo,
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
pruebas), juega la partida y verifica **21 casos** (arranque, HUD, cliente,
recoger/entregar, entrega incorrecta, CNC, fin de partida, revancha, joystick,
cámara, pausa en segundo plano, mando, safe areas, metadatos y service worker),
más una recarga **sin conexión** y una comprobación en **horizontal**.
Además guarda capturas en `docs/evidencias/`.

Resultado de la última ejecución: **21/21 + offline**, consola sin errores.

El modo VR tiene su propia suite de escritorio:

```powershell
node tools/test-vr.js
```

**21/21 casos** (estéreo real, IPD, convergencia, perfiles, HUD por ojo y plano,
distorsión, WASD/Shift/Espacio/Escape, restauración al salir y no regresión del
juego), más mouse con eventos reales y arranque con `?vr=1`.

El mando nativo y el VR móvil se prueban con un iPhone simulado:

```powershell
node tools/test-pad.js
```

**21/21 casos**: inyecta `__RASMATIC_NATIVE__` antes de cargar la página (igual
que `GameViewController.swift`), y comprueba sticks, cámara, correr 2,4×,
A/B/X/Y/Select, desconexión/reconexión, ausencia de doble entrada, ocultado del
joystick, VR por ojo, aviso de rotación y salida segura.

La estructura del proyecto iOS se verifica sin Mac:

```powershell
node tools/check-xcode.js     # 118 comprobaciones
node tools/verify-ipa.js dist/RasmaticLugar3D-unsigned.ipa
```

> Importante: esto corre en Chromium, no en Safari. Lo que solo se puede
> comprobar en un iPhone real está listado al final de `docs/pruebas.md`.

---

## Documentación

- `docs/paridad.md` — equivalencia con Android, archivo por archivo, y las
  diferencias con su justificación.
- `docs/pruebas.md` — matriz de pruebas por entorno, resultados, evidencias y lo
  que no se pudo verificar (Safari, Xcode, iPhone, mando y VR físicos).
- `docs/mando-bluetooth.md` — emparejar el mando con iOS, mapeo exacto, puente
  `GameController`, reconexión y problemas frecuentes.
- `docs/vr-box-preview.md` — modo VR en el iPhone y vista previa en Windows:
  controles, ajustes, cómo funciona el estéreo, pruebas y limitaciones.
- `docs/instalar-en-iphone.md` — guía de 11 pasos por USB en Windows, las otras
  formas de instalar, costos, límites de Apple y problemas frecuentes.
- `docs/firma-y-requisitos.md` — qué significa “sin firmar”, requisitos por
  etapa, bundle id, seguridad y estado real de la entrega.

---

## Estado de la entrega

| | |
|---|---|
| Juego copiado del APK Android | 6 archivos + 13 fuentes, SHA-256 idéntico |
| `web/index.html` generado | 264.739 B · `C429FA93410065F3F3E7D46629D230568368CE35AAA415859999E131EB17346D` |
| Verificación del proyecto iOS | 118/118 comprobaciones |
| Pruebas funcionales (Chromium) | 21/21 + offline + horizontal |
| Pruebas del modo VR (escritorio) | 21/21 + mouse + `?vr=1` |
| Pruebas de mando nativo y VR móvil (iPhone simulado) | 21/21 |
| Verificador de `.ipa` | probado con un IPA sintético (estructura, Mach-O, bundle id y juego completo) |
| ZIP para llevar a la Mac | `dist/RASMATIC-Lugar3D-iPhone-<fecha>.zip` · hash en `dist/<zip>.sha256` |
| `.ipa` compilado y firmado | **pendiente**: requiere runner macOS y una cuenta Apple |

Pendiente (requiere hardware Apple): compilar en Xcode, generar el `.ipa`,
firmarlo, instalarlo, abrir en Safari/WKWebView real, probar un mando Bluetooth
real y las VR Box físicas. Ver `docs/pruebas.md` § “Lo que NO se pudo verificar
acá”.
