# VR BOX: modo estéreo en el iPhone y vista previa en Windows

El proyecto incluye un modo VR propio: dos cámaras reales (una por ojo) con
frustums asimétricos *off-axis*, HUD y menús dibujados dentro de cada ojo, y un
panel para ajustar IPD, convergencia, FOV, tamaño, separación y distorsión.

Se usa de dos formas:

- **En el iPhone**, con el teléfono dentro de unas VR Box y un mando Bluetooth.
  Es el uso real.
- **En Windows**, como vista previa de escritorio para comparar proporciones y
  óptica sin tener el teléfono a mano.

> El modo VR **no cambia el juego**: la escena, la partida, el HUD y los
> controles son los mismos. Solo cambia cómo se dibuja la cámara y cómo se
> reparte la interfaz entre los dos ojos. Con el modo apagado, el render es
> exactamente el original.

---

## 1. Cómo abrirlo

### En el iPhone (app o PWA)

| Forma | Cómo |
|---|---|
| Botón **VR BOX** | Arriba al centro de la pantalla, para no chocar con el joystick |
| Mando: **X** | Abre/cierra el panel de ajustes VR |
| Menú de pausa | Entrada **VR BOX** (si el menú está disponible) |
| URL directa | `index.html?vr=1` arranca ya en modo VR |

Al activarlo se abre el panel. El botón **Salir (Esc)** del panel cierra el modo
y vuelve a la vista normal; también se puede tocar **VR BOX** de nuevo. En el
iPhone el botón VR se mueve dentro del ojo izquierdo cuando el modo está activo,
así que siempre queda accesible como salida segura.

### En Windows (vista previa)

```powershell
cd C:\Users\valen\OneDrive\Desktop\Programacion\Juego3d-iPhone
node tools/serve.js --port 8080
```

Abrir en Edge o Chrome:

```
http://127.0.0.1:8080/index.html
```

| Forma | Cómo |
|---|---|
| Botón **VR BOX** | Abajo a la izquierda (solo escritorio) |
| Tecla `V` | Activa/desactiva el modo |
| Tecla `H` | Muestra/oculta el panel |
| Tecla `Esc` | Sale del modo |
| URL directa | `index.html?vr=1` |

Nada de esto se guarda en el juego: el estado de la partida continúa (no se
reinicia).

---

## 2. Controles

### En el iPhone

Los controles son los del juego, no un mando virtual:

| Entrada | Acción |
|---|---|
| Joystick táctil | Mover |
| Arrastrar el dedo | Girar la cámara |
| Botón **CORRER** | Correr |
| Botón contextual | Interactuar |
| Mando Bluetooth | Ver `docs/mando-bluetooth.md` (mismo mapeo que Android) |

Con mando conectado se ocultan el joystick, **CORRER**, pausa y el botón
contextual, también en VR. Si el mando se desconecta, vuelven solos: el juego
nunca queda bloqueado.

### En Windows (vista previa)

| Tecla / mouse | Acción |
|---|---|
| `W` `A` `S` `D` / flechas | Moverse por el pasillo |
| Arrastrar con el mouse | Girar la cámara |
| `Shift` | Correr |
| `Espacio` | Interactuar |
| `Esc` | Salir del modo VR |
| `V` | Entrar/salir del modo VR |
| `H` | Mostrar/ocultar el panel |

El **mando físico no se conecta a la PC**: en el uso real va por Bluetooth al
iPhone. Los controles de Windows son solo para probar la vista previa.

---

## 3. Ajustes del panel

| Ajuste | Para qué |
|---|---|
| **Perfil de pantalla** | Ventana (llenar), iPhone 15 horizontal/vertical, iPhone 13 horizontal, iPhone SE horizontal, VR Box 16:9, VR Box 2:1 y Personalizado |
| **Ancho / Alto** | Solo con perfil Personalizado (320–4096 px) |
| **IPD** | Separación entre ojos, 50–75 mm (por defecto 64 mm) |
| **Convergencia** | Distancia del plano de disparidad cero, 0,5–10 m (por defecto 3 m) |
| **Campo de visión** | FOV vertical por ojo, 40–100° (por defecto 62°, el de la partida) |
| **Tamaño de imagen** | Qué porcentaje de cada mitad ocupa la imagen (50–100 %) |
| **Separación central** | Franja negra extra en el medio (0–10 %) |
| **Distorsión de lente** | Aproximación radial de la lente de las VR Box (0–30 %) |
| **HUD** | **Por ojo** (VR real), **Plano** (una sola vez) u **Oculto** |
| **Guías** | Marco de la pantalla simulada + zona segura |
| **Viñeta de lentes** | Oscurecimiento en los bordes de cada ojo |
| **Activar VR** | Entra o sale del modo sin cerrar el panel |
| **Pantalla completa** | Pasa el navegador a pantalla completa |
| **Ocultar panel (H)** | Deja solo la escena |
| **Salir (Esc)** | Cierra el modo y restaura la vista normal |

Los ajustes se guardan en `localStorage` con la clave
**`rasmatic.vr.settings.v2`**. Si existía la versión anterior
(`rasmatic.vr.settings.v1`), se migra: el antiguo `hud: true` pasa a
`hudMode: 'flat'` y `hud: false` a `hudMode: 'off'`. La opción por defecto es
**Por ojo**, que es la que se usa con las gafas.

### Perfiles y qué representan

El perfil define el **marco** donde se dibuja la pantalla simulada: el resto de
la ventana queda negro, como el cuerpo de las gafas. El marco conserva la
proporción pedida y se centra; dentro de él van las dos vistas. El HUD y los
controles se recortan a ese marco, porque son la "pantalla plana" del iPhone.

No se afirma que esto reproduzca todos los modelos de teléfono: las
resoluciones son las nominales de cada modelo y sirven para comparar
proporciones y zonas seguras.

### Aviso de orientación

Dentro de las VR Box el teléfono va **horizontal**. Si se activa VR en vertical,
aparece un aviso **“Girá el iPhone”** con un botón **“Continuar así”**. El aviso
no bloquea: se puede seguir jugando en vertical si se elige. Al girar el
teléfono, el aviso desaparece y el layout se recalcula.

---

## 4. Cómo está hecho

- **Estéreo real, no imagen duplicada.** Se reutiliza la cámara del juego y se
  dibuja dos veces: una por ojo. Cada ojo tiene su propio viewport y un frustum
  asimétrico *off-axis* (las dos cámaras miran en la misma dirección; no hay
  `toe-in`). El desplazamiento lateral es `IPD/2` sobre el eje derecho de la
  cámara y el corrimiento del frustum es `(IPD/2)·near/convergencia`.
- **La cámara del juego no se rompe.** Antes de cada ojo se guardan posición,
  orientación y matrices; al terminar el frame se restauran junto con viewport,
  scissor, render target, color de limpieza y `autoClear`. Como se usa la misma
  cámara, la mano del jugador (hija de la cámara) y todo lo que el juego cuelga
  de ella siguen funcionando.
- **Cuando el modo está apagado no hay costo.** `renderer.render` se intercepta
  una vez: si VR está inactivo se llama al render original con los mismos
  argumentos (paso directo).
- **Distorsión de lente aproximada.** Con distorsión > 0 cada ojo se dibuja en
  un `WebGLRenderTarget` y se copia a pantalla con un quad cuyas UV se deforman
  radialmente (malla de 48×48). Es una aproximación, no una calibración.
- **HUD y menús por ojo.** El HUD (`#rg-hud`), el menú de pausa (`#ras-pause`) y
  el panel de resultado (`#rg-end`) se clonan dentro de dos contenedores
  (`.vr-mirror`, uno por ojo). El contenedor tiene `transform`, y un transform
  lo convierte en el bloque de referencia de los hijos `position: fixed`: cada
  copia ocupa exactamente su ojo. El original queda con `opacity: 0` pero
  **conserva el foco y los `.click()`** que usa el mando, así que las acciones
  siguen funcionando. El selector CSS apunta al hijo directo de `body` para no
  ocultar las copias.
- **Layout vivo.** Mientras VR está activo, un intervalo de 250 ms recoloca las
  copias, el botón VR, el panel y el aviso de rotación. Así los cambios de
  tamaño, orientación o texto del HUD no desalinean las lentes.
- **Separado del juego.** Todo vive en `web/vr/`; no se editó `GamepadManager.kt`,
  `android-bridge.js` ni `ios-bridge.js`, y el módulo no toca el estado de la
  partida.

### API para pruebas

```js
RasmaticVR.enable() / disable() / toggle() / isActive()
RasmaticVR.isDesktop() / isMobile()
RasmaticVR.set('ipd', 68) / set('hudMode', 'per-eye') / profile('iphone-15-landscape') / reset()
RasmaticVR.panel(true) / toggleFullscreen()
RasmaticVR.state()      // ajustes, etapa, ojos, matrices, frames, mirrors
RasmaticVR.snapshot()   // PNG del canvas
```

`RasmaticVR.state()` devuelve, entre otras cosas, `mobile`, `hudMode`,
`mirrors`, `landscape`, `rotateWarning`, `panelOpen`, `eyes` y `stats.frames`.

---

## 5. Pruebas ejecutadas

### Escritorio (Windows)

```powershell
node tools/test-vr.js
```

Levanta el servidor, abre Edge/Chrome headless en ventana de escritorio
(1280×720, DPR 1, sin emulación táctil), ejecuta la suite y guarda capturas en
`docs/evidencias/`.

Resultado de la última corrida (12 de noviembre de 2026):

```
21/21 casos superados.
  ok   mouse gira la camara (yaw 0.000 -> -0.800)
  ok   el modo VR arranca solo con ?vr=1
Consola sin errores.
```

| # | Caso | Resultado | Dato medido |
|---|---|---|---|
| V01 | Módulo cargado, apagado y sin tocar el renderer | ok | viewport 1280×720, scissor off |
| V01b | Botón de acceso visible en escritorio | ok | visible |
| V02 | Activar VR y dibujar las dos vistas | ok | 2 ojos, 640×720 cada uno |
| V03 | Dos cámaras separadas por el IPD | ok | 0,064 m, mismo centro, misma orientación |
| V03b | Frustums asimétricos opuestos (off-axis) | ok | +0,019971 / −0,019971 |
| V04 | Las dos vistas no son la misma imagen | ok | 43,5 % de píxeles distintos |
| V05 | El IPD cambia la separación y la imagen | ok | 50 → 75 mm, 20,4 % de píxeles |
| V06 | La convergencia ajusta el off-axis | ok | 1 m vs 10 m → ×10 |
| V07 | Perfiles ventana, iPhone H/V y personalizado | ok | proporciones exactas |
| V08 | Tamaño de imagen y separación central | ok | 80 % / 5 % |
| V08b | El control del panel actualiza el ajuste | ok | IPD 70 mm |
| V08c | HUD por ojo dentro del marco | ok | copias en los dos ojos |
| V08d | HUD plano recortado al marco | ok | HUD = marco |
| V09 | Distorsión por render target y vuelta al paso directo | ok | brillo 166,2 vs 167,6 |
| V10 | WASD mueve y Shift corre | ok | 7,8 m vs 18,72 m (×2,4) |
| V10b | Espacio interactúa (JUGAR) | ok | estado `playing` |
| V10c | Escape sale del modo VR | ok | inactivo |
| V11 | Al salir se restauran cámara, proyección y renderer | ok | frames VR congelados, HUD completo |
| V12 | El juego normal sigue funcionando después de VR | ok | recoger + entregar +1 |
| V13 | Pantalla completa disponible sin errores | ok | API presente |
| V14 | Rendimiento (informativo, WebGL por software) | — | ~29 ms/frame promedio |

### iPhone simulado (Chromium, 844×390, táctil)

```powershell
node tools/test-pad.js
```

**21/21** casos (P01–P14 y M01–M08). Los casos de VR móvil comprueban:

- el botón VR está disponible en el teléfono y activa el modo;
- la salida queda dentro del ojo izquierdo;
- el HUD completo se ve dentro de **cada** ojo (copias, original invisible);
- en horizontal no hay aviso de rotación; en vertical aparece y se puede
  continuar;
- con mando conectado se ocultan joystick, correr y pausa; al desconectarlo
  vuelven;
- la salida desde el panel restaura el HUD y el juego sigue jugándose;
- **X** abre y cierra el panel fuera del modo.

### Capturas

| Archivo | Qué muestra |
|---|---|
| `docs/evidencias/vr-01-normal.png` | Vista normal (una cámara) en el pasillo |
| `docs/evidencias/vr-02-vr-box.png` | Estéreo real, perfil Ventana |
| `docs/evidencias/vr-03-vr-iphone.png` | Perfil iPhone 15 horizontal + guías y safe area |
| `docs/evidencias/vr-04-distortion.png` | Distorsión de lente al 20 % |
| `docs/evidencias/vr-05-portrait.png` | Perfil iPhone 15 vertical |
| `docs/evidencias/vr-06-panel.png` | Panel de ajustes abierto |
| `docs/evidencias/pad-02-vr-iphone.png` | VR en iPhone simulado, HUD por ojo |
| `docs/evidencias/pad-03-girar-iphone.png` | Aviso de girar el iPhone en vertical |

---

## 6. Limitaciones (lo que no se puede verificar acá)

- **No hay seguimiento de cabeza.** No hay AR/WebXR: la cámara se mueve con el
  mando, el mouse o el dedo, no con el giro del teléfono.
- **La distorsión es aproximada.** Sin las lentes reales no se puede calibrar
  la deformación exacta de cada VR Box; los valores sirven para comparar.
- **No se probó en un iPhone real** (no hay macOS ni iPhone en este entorno):
  Safari, WKWebView, las safe areas reales y el rendimiento del iPhone siguen
  sin verificar en hardware.
- **No se probaron las lentes físicas** de las VR Box: la separación, el IPD y
  la distorsión son ajustes para calibrar a ojo.
- **Rendimiento medido con WebGL por software** (headless). En un iPhone con GPU
  el costo de dibujar dos vistas es aproximadamente el doble del normal.
- **El mando real no se conecta a la PC**: va por Bluetooth al iPhone.

---

## 7. Archivos

Nuevos:

| Archivo | Contenido |
|---|---|
| `web/vr/vr-preview.js` | Módulo VR: estéreo, perfiles, panel, copias por ojo, rotación, API |
| `web/vr/vr-preview.css` | Botón, panel, guías, viñeta, copias, aviso de rotación |
| `tools/test-vr.js` | Arranque headless de escritorio, suite, capturas, `?vr=1` |
| `tools/test-vr-suite.js` | Casos V01–V14 dentro de la página |
| `tools/test-pad.js` | iPhone simulado con puente nativo y VR móvil |
| `tools/test-pad-suite.js` | Casos P01–P14 y M01–M08 |
| `docs/vr-box-preview.md` | Este documento |

Modificados:

| Archivo | Cambio |
|---|---|
| `tools/build-ios.js` | Verifica `web/vr/`, enlaza CSS/JS en el `index.html` generado y los agrega al precache de `sw.js` |
| `tools/check-xcode.js` | Comprueba que el `index.html` incluya el modo VR y sus estilos |
| `web/ios/ios-bridge.js` | **X** abre el panel VR; el mando nativo usa la misma superficie |
| `docs/pruebas.md` | Secciones del modo VR y del mando |
| `docs/paridad.md` | Aclara que el modo VR es una capa extra, ahora también en iPhone |
| `README.md` | Acceso al modo VR y a este documento |

Sin cambios (a propósito): `web/mobile/game.js`, `web/mobile/android-bridge.js`,
los CSS del juego, `android/` y el proyecto Xcode. El `index.html` de `web/`
sigue generándose con `tools/build-ios.js`; el modo VR se inyecta ahí con dos
líneas verificables (hoja de estilos y script).
