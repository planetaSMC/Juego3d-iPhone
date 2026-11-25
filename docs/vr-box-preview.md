# VR BOX: modo estéreo y calibración en el iPhone

El proyecto incluye un modo VR propio: dos cámaras reales (una por ojo) con
frustums asimétricos *off-axis*, HUD y menús dibujados dentro de cada ojo, y un
panel de **calibración completa** para usar el teléfono dentro de unas VR Box.

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
| Tecla `T` | Entra/sale del modo prueba |
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

> **No hay seguimiento de cabeza.** El movimiento y la cámara siguen saliendo
> del mando Bluetooth (o del arrastre táctil). Los ajustes de cámara del panel
> son fijos: sirven para encuadrar la escena, no para mirar alrededor.

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
| `T` | Modo prueba |

El **mando físico no se conecta a la PC**: en el uso real va por Bluetooth al
iPhone. Los controles de Windows son solo para probar la vista previa.

---

## 3. Calibración VR (panel por categorías)

El panel se organiza en siete pestañas. Cada control tiene **valor numérico
visible**, **slider**, botones **− / +** para ajuste fino y una ayuda breve. Los
cambios se aplican en tiempo real y se guardan solos.

Todos los límites están acotados en el código (`SPEC`) y el valor se recorta al
rango seguro al cargar o importar, para que un perfil corrupto no rompa la
vista.

### Cámara

| Ajuste | Rango | Por defecto | Para qué |
|---|---|---|---|
| Campo de visión (FOV) | 40–110° | 70° | Grados verticales por ojo; más grados muestran más escenario |
| Zoom de cámara | 0,50–2,00× | 1,00× | Acerca o aleja sin mover al personaje |
| Distancia de cámara | −3,00–3,00 m | 0,00 m | Aleja/acerca la cámara sobre su eje de vista |
| Altura de cámara | −1,50–1,50 m | 0,00 m | Sube o baja el punto de vista |
| Posición horizontal | −0,60–0,60 m | 0,00 m | Corre la cámara a izquierda/derecha |
| Posición vertical | −0,60–0,60 m | 0,00 m | Corre la cámara arriba/abajo |
| Inclinación | −20–20° | 0° | Inclina la vista arriba/abajo (fija, no head tracking) |

### 3D

| Ajuste | Rango | Por defecto | Para qué |
|---|---|---|---|
| IPD virtual | 50–75 mm | 64 mm | Separación entre los dos ojos virtuales |
| Intensidad 3D | 0–2,00× | 1,00× | Multiplica separación y convergencia; 0 deja la imagen plana |
| Convergencia | 0,5–10,0 m | 3,0 m | Distancia del plano de disparidad cero |

### Lente izquierda / Lente derecha

Cada ojo se ajusta por separado (mismos rangos en ambas pestañas):

| Ajuste | Rango | Por defecto | Para qué |
|---|---|---|---|
| Desplazamiento horizontal | −25–25 % | 0 % | Mueve solo esa vista dentro de su área |
| Desplazamiento vertical | −25–25 % | 0 % | Sube o baja solo esa vista |
| Escala de la vista | 0,60–1,20× | 1,00× | Tamaño independiente de esa imagen |
| Recorte de bordes | 0–25 % | 0 % | Recorta la franja que tapa la lente |

### Pantalla

| Ajuste | Rango | Por defecto | Para qué |
|---|---|---|---|
| Perfil de pantalla | — | Ventana | Ventana, iPhone 15 H/V, iPhone 13 H, iPhone SE H, VR Box 16:9, VR Box 2:1, Personalizado |
| Ancho / Alto | 320–4096 px | 1920×1080 | Solo con perfil Personalizado |
| Tamaño de las dos imágenes | 50–100 % | 100 % | Porcentaje de cada mitad que ocupa la imagen |
| Margen central | 0–10 % | 2 % | Franja negra extra para separar las lentes |
| Desplazamiento horizontal del conjunto | −25–25 % | 0 % | Mueve las dos vistas juntas |
| Desplazamiento vertical del conjunto | −25–25 % | 0 % | Sube o baja las dos vistas juntas |
| Relación de aspecto | Auto o 0,20–3,00:1 | Auto | Fuerza el marco (por ejemplo 2,00 para 2:1) |
| Distorsión de lente | 0–30 % | 0 % | Aproximación radial de la lente de las VR Box |
| HUD | Por ojo / Plano / Oculto | Por ojo | Cómo se reparte la interfaz |
| Guías | on/off | off | Marco de pantalla + zona segura |
| Viñeta de lentes | on/off | off | Oscurecimiento en los bordes de cada ojo |

### Imagen

| Ajuste | Rango | Por defecto | Para qué |
|---|---|---|---|
| Brillo | 0,50–1,80× | 1,00× | Multiplica el brillo |
| Contraste | 0,50–1,80× | 1,00× | Separa claros y oscuros |
| Saturación | 0–2,00× | 1,00× | 0 = blanco y negro |
| Gamma | 0,50–2,20 | 1,00 | Corrige tonos medios sin quemar blancos |
| Nitidez | 0–1,00 | 0,00 | Realce suave de bordes; valores altos generan halos |

Con **todos** los valores de imagen en neutro y sin distorsión ni recorte, el
modo VR no usa postproceso: vuelve al camino directo y no cuesta FPS extra.

### Restaurar

- **Restaurar Cámara / 3D / lente izquierda / lente derecha / Pantalla / Imagen**:
  vuelve solo esa categoría a sus valores por defecto.
- **Restablecer todo** y **Volver al predeterminado**: devuelven todos los
  ajustes a neutro.

### Persistencia

La calibración se guarda sola en `localStorage` con la clave
**`rasmatic.vr.settings.v2`**. Salir del juego, cerrar la app o volver a abrirla
conserva los valores. Si existía la versión anterior
(`rasmatic.vr.settings.v1`), se migra: el antiguo `hud: true` pasa a
`hudMode: 'flat'` y `hud: false` a `hudMode: 'off'`.

### Perfiles guardados

La pestaña **Perfiles** permite:

- **Guardar** la calibración actual con un nombre (hasta 24 caracteres).
- **Cargar** o **borrar** un perfil guardado.
- **Exportar** la configuración como JSON (la copia al portapapeles si el
  navegador lo permite y además la muestra en un cuadro de texto).
- **Importar** ese mismo JSON.
- Ver si el perfil activo es **Predeterminado** o **Personalizado (N cambios)**.

Los perfiles se guardan en `rasmatic.vr.profiles.v1`. Sirven para tener uno por
cada VR Box o por cada persona.

### Modo prueba

El interruptor **Modo prueba** (o la tecla `T`) cambia la escena del juego por
una escena de calibración independiente:

- cuadrícula frontal a 2,5 m y otra lejana a 5 m;
- ejes centrales y anillos concéntricos como referencia de simetría;
- piso en perspectiva;
- cubos a 1, 1,8, 3,2, 4,2 y 6 m con su distancia rotulada;
- marcas naranjas en los cuatro bordes de la vista;
- esfera **CENTRO** con cruz en el centro exacto de cada lente;
- overlay con el centro y los límites de cada ojo (`IZQ` / `DER`) y el eje de
  simetría;
- HUD, joystick y botones ocultos.

Es la forma de comprobar, con las gafas puestas, si las dos imágenes quedan
centradas, si los bordes se recortan y si el parallax se siente correcto.

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
  de ella siguen funcionando. Los ajustes de cámara (distancia, altura, shifts,
  inclinación) se aplican a una copia y se descartan al terminar el frame.
- **Cuando el modo está apagado no hay costo.** `renderer.render` se intercepta
  una vez: si VR está inactivo se llama al render original con los mismos
  argumentos (paso directo).
- **Postproceso solo cuando hace falta.** Con distorsión, recorte o ajustes de
  imagen no neutros, cada ojo se dibuja en un `WebGLRenderTarget` y se copia a
  pantalla con un shader que aplica distorsión radial, recorte, brillo,
  contraste, saturación, gamma y nitidez. Con todo neutro el camino es directo.
- **HUD, JUGAR y menús por ojo.** El HUD (`#rg-hud`), el botón de interacción
  (`#rg-act`), el menú de pausa (`#ras-pause`) y el panel de resultado
  (`#rg-end`) se clonan dentro de dos contenedores (`.vr-mirror`, uno por ojo).
  El contenedor tiene `transform`, y un transform lo convierte en el bloque de
  referencia de los hijos `position: fixed`: cada copia ocupa exactamente su
  ojo. El original queda con `opacity: 0` pero **conserva el foco y los
  `.click()`** que usa el mando; los toques sobre las copias se reenvían al
  original, así que las acciones siguen funcionando. El selector CSS apunta al
  hijo directo de `body` para no ocultar las copias.
- **HUD 1:1, no a la mitad.** Las copias de HUD, JUGAR y resultado usan
  `transform: scale(1)` con el ancho/alto del ojo: ocupan el ojo completo. Antes
  se escalaban con `scale(eyes[0].w / stage.w)` y quedaban en la mitad superior
  de cada ojo. El menú de pausa conserva el escalado anterior porque es
  configuración, no gameplay.
- **Safe areas por ojo.** Las copias usan las mismas variables CSS del HUD
  (`--rg-x`, `--rg-y`, `--rg-boost`), con `--rg-boost: 1.28` para compensar que
  cada ojo mide la mitad del ancho. Los márgenes seguros laterales se anulan en
  el borde interior y se aplican solo en el borde exterior de cada ojo; el reloj
  se corre 52 px hacia adentro para no chocar con el ⚙.
- **Layout vivo.** Mientras VR está activo, un intervalo de 250 ms recoloca las
  copias, el botón VR, el panel, las guías y el aviso de rotación. Así los
  cambios de tamaño, orientación o texto del HUD no desalinean las lentes.
- **Escena de prueba separada.** El modo prueba no toca la partida: construye
  su propia escena y su propia cámara, y solo se dibuja mientras está activo.
- **Separado del juego.** Todo vive en `web/vr/`; no se editó
  `GamepadManager.kt`, `android-bridge.js` ni `ios-bridge.js`, y el módulo no
  toca el estado de la partida.

### API para pruebas

```js
RasmaticVR.enable() / disable() / toggle() / isActive()
RasmaticVR.isDesktop() / isMobile()
RasmaticVR.set('ipd', 68) / set('hudMode', 'per-eye') / profile('iphone-15-landscape')
RasmaticVR.reset() / resetGroup('cam' | 'stereo' | 'left' | 'right' | 'screen' | 'image')
RasmaticVR.saveConfig('nombre') / loadConfig('nombre') / deleteConfig('nombre')
RasmaticVR.listConfigs() / exportConfig() / importConfig(texto)
RasmaticVR.panel(true) / toggleFullscreen()
RasmaticVR.state()      // ajustes, etapa, ojos, matrices, frames, mirrors, perfiles
RasmaticVR.snapshot()   // PNG del canvas
```

`RasmaticVR.state()` devuelve, entre otras cosas, `settings`, `preset`,
`changes`, `configs`, `stage`, `eyes`, `path` (`direct` o `rt`), `test`,
`mobile`, `hudMode`, `mirrors`, `landscape`, `rotateWarning`, `panelOpen` y
`stats.frames`.

---

## 5. Pruebas ejecutadas

### Escritorio (Windows)

```powershell
node tools/test-vr.js
```

Levanta el servidor, abre Edge/Chrome headless en ventana de escritorio
(1280×720, DPR 1, sin emulación táctil), ejecuta la suite y guarda capturas en
`docs/evidencias/`.

Resultado de la última corrida (25 de noviembre de 2026):

```
33/33 casos superados.
  ok   mouse gira la camara (yaw 0.000 -> -0.800)
  ok   el modo VR arranca solo con ?vr=1
Consola sin errores.
```

| # | Caso | Resultado | Dato medido |
|---|---|---|---|
| V01 | Módulo cargado, apagado y sin tocar el renderer | ok | viewport 1280×720, scissor off |
| V01b | Botón de acceso visible en escritorio | ok | visible |
| V02 | Activar VR y dibujar las dos vistas | ok | 2 ojos, 627×720 cada uno |
| V03 | Dos cámaras separadas por el IPD | ok | 0,064 m, misma orientación |
| V03b | Frustums asimétricos opuestos (off-axis) | ok | +0,019971 / −0,019971 |
| V04 | Las dos vistas no son la misma imagen | ok | 43,5 % de píxeles distintos |
| V05 | El IPD cambia la separación y la imagen | ok | 50 → 75 mm, 20,4 % de píxeles |
| V06 | La convergencia ajusta el off-axis | ok | 1 m vs 10 m → ×10 |
| V07 | Perfiles ventana, iPhone H/V y personalizado | ok | proporciones exactas |
| V08 | Tamaño de imagen y separación central | ok | 80 % / 5 % |
| V08b | El control del panel actualiza el ajuste | ok | IPD 70 mm |
| V08c | HUD por ojo **1:1** dentro del área segura | ok | copias = rectángulo del ojo, fuentes 48,6/46,1 px |
| V08d | HUD plano recortado al marco | ok | HUD = marco |
| V08e | JUGAR espejado y centrado en cada ojo | ok | copias 256×83 en ambos ojos, original oculto |
| V09 | Distorsión por render target y vuelta al paso directo | ok | brillo 166,2 vs 167,6 |
| V10 | WASD mueve y Shift corre | ok | 7,8 m vs 18,72 m (×2,4) |
| V10b | Espacio interactúa (JUGAR) | ok | estado `playing` |
| V10c | Escape sale del modo VR | ok | inactivo |
| V11 | Al salir se restauran cámara, proyección y renderer | ok | frames VR congelados, HUD completo |
| V12 | El juego normal sigue funcionando después de VR | ok | recoger + entregar +1 |
| V13 | Pantalla completa disponible sin errores | ok | API presente |
| V14 | Rendimiento (informativo, WebGL por software) | — | ~29 ms/frame promedio |
| V15 | El logo RASMATIC no aparece en la partida | ok | emblema, reflejo, letras, eslogan y cartel ocultos |
| V16 | Cámara: altura, distancia, inclinación y zoom | ok | +0,50 m · +1,00 m · pitch y proyección distintos |
| V17 | Intensidad 3D escala la separación estéreo | ok | 0 m vs 0,096 m |
| V18 | Escala y desplazamiento independientes por ojo | ok | 80 % izq., +10 %/+5 % der., restauración exacta |
| V19 | Desplazamiento del conjunto, aspecto y recorte | ok | +10 % de ancho, 2,00:1, `rt` → `direct` |
| V20 | Imagen: brillo real y neutro de vuelta al paso directo | ok | +3 niveles de brillo, `rt` → `direct` |
| V21 | Modo prueba independiente y vuelta | ok | overlay visible, HUD oculto, espejo restaurado |
| V22 | Guardar, cargar, exportar, importar y borrar perfiles | ok | FOV 84 y brillo 1,2 conservados |
| V23 | Persistencia al salir/entrar | ok | IPD 68 y altura 0,2 en `localStorage` |
| V24 | Restaurar una categoría no toca las demás | ok | cámara a neutro, imagen intacta |
| V25 | Panel completo por categorías y control conectado | ok | 7 pestañas, FOV 75 desde la UI |

### iPhone simulado (Chromium, 844×390, táctil)

```powershell
node tools/test-pad.js
```

**21/21** casos (P01–P14 y M01–M08). Los casos de VR móvil comprueban:

- el botón VR está disponible en el teléfono y activa el modo;
- la salida queda dentro del ojo izquierdo;
- el HUD completo se ve dentro de **cada** ojo (copias, original invisible) y
  **JUGAR** aparece centrado en los dos ojos;
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
| `docs/evidencias/vr-06-panel.png` | Panel de calibración abierto (pestaña Cámara) |
| `docs/evidencias/vr-07-test-mode.png` | Modo prueba: cuadrícula, centros de lente y simetría |
| `docs/evidencias/pad-02-vr-iphone.png` | VR en iPhone simulado, HUD por ojo |
| `docs/evidencias/pad-03-girar-iphone.png` | Aviso de girar el iPhone en vertical |

---

## 6. Limitaciones (lo que no se puede verificar acá)

- **No hay seguimiento de cabeza.** No hay AR/WebXR: la cámara se mueve con el
  mando, el mouse o el dedo, no con el giro del teléfono. Los ajustes de cámara
  del panel son fijos.
- **La distorsión es aproximada.** Sin las lentes reales no se puede calibrar
  la deformación exacta de cada VR Box; los valores sirven para comparar.
- **No se probó en un iPhone real** (no hay macOS ni iPhone en este entorno):
  Safari, WKWebView, las safe areas reales y el rendimiento del iPhone siguen
  sin verificar en hardware.
- **No se probaron las lentes físicas** de las VR Box: la separación, el IPD, la
  convergencia y la distorsión son ajustes para calibrar a ojo.
- **Rendimiento medido con WebGL por software** (headless). En un iPhone con GPU
  el costo de dibujar dos vistas es aproximadamente el doble del normal; el
  postproceso solo se activa cuando hay ajustes no neutros.
- **El mando real no se conecta a la PC**: va por Bluetooth al iPhone.
- **Exportar/importar** depende del portapapeles del navegador; si no está
  disponible, el JSON siempre queda visible en el cuadro de texto.

---

## 7. Archivos

Nuevos:

| Archivo | Contenido |
|---|---|
| `web/vr/vr-preview.js` | Módulo VR: estéreo, calibración, postproceso, escena de prueba, perfiles, API |
| `web/vr/vr-preview.css` | Botón, panel por categorías, guías, viñeta, copias, aviso de rotación |
| `tools/test-vr.js` | Arranque headless de escritorio, suite, capturas, `?vr=1` |
| `tools/test-vr-suite.js` | Casos V01–V25 dentro de la página |
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

Sin cambios (a propósito): `web/mobile/game.js` (salvo quitar el aviso del logo),
`web/mobile/android-bridge.js`, los CSS del juego, `android/` y el proyecto
Xcode. El `index.html` de `web/` sigue generándose con `tools/build-ios.js`; el
modo VR se inyecta ahí con dos líneas verificables (hoja de estilos y script).
