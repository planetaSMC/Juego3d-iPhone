# UI durante el gameplay (fases V17 y V18)

Renovación de la interfaz que aparece **dentro de la partida**: marcador, reloj,
pedido, “llevás”, avisos, pista de interacción, botón **JUGAR / RECOGER /
ENTREGAR** y panel de resultado. No se rediseñaron los menús de configuración ni
los controles de calibración.

---

## 1. Diagnóstico

Antes de tocar nada se revisó `web/mobile/android-game.css`, `game.js`
(`buildUI()`), `web/vr/vr-preview.js` (`syncMirror`, `placeOverlays`,
`restoreOverlays`) y la evidencia `docs/evidencias/vr-02-vr-box.png`.

Problemas encontrados:

| # | Problema | Causa |
|---|---|---|
| 1 | **JUGAR pegado al borde derecho**, no centrado y con riesgo de chocar con el joystick | `#rg-act` estaba anclado con `right: 16px; bottom: 24px`; `placeOverlays` lo movía con un `translate` calculado desde la esquina |
| 2 | Textos diminutos (10–13 px) y de peso medio | tamaños fijos en px: `.rg-team span` 10 px, `#rg-carry` 13 px, `#rg-hint` 13,5 px |
| 3 | Posiciones verticales fijas (`top: 76px`, `top: 148px`, `bottom: 196px`) | no escalaban con la altura real; en pantallas bajas se amontonaban o se salían |
| 4 | Aviso central y pista podían pisarse entre sí y con el marcador | `#rg-toast` en `top: 21%` y `#rg-hint` a `bottom: 196px`, sin relación entre ellos |
| 5 | **HUD a media altura en VR/SBS** | las copias por ojo se escalaban con `scale(eyes[0].w / stage.w)`, así que ocupaban solo la mitad superior de cada ojo |
| 6 | **JUGAR solo aparecía en un ojo** | `#rg-act` no se espejaba por ojo: el original quedaba en el borde de la ventana completa |
| 7 | Reloj chocando con el botón ⚙ en VR | ambos anclados a la esquina superior derecha del ojo |
| 8 | Áreas seguras incompletas | `env(safe-area-inset-*)` solo se usaba en izquierda/derecha/abajo, y en las copias por ojo se aplicaba en el borde interior (centro de la pantalla), donde no hay notch |
| 9 | Panel de resultado con tamaños fijos | `h2` 24 px, puntajes 44 px, sin adaptación a pantallas bajas |
| 10 | La PWA instalada podía seguir con la UI vieja | el `buildId` del service worker solo hasheaba el HTML, no los CSS/JS |

---

## 2. Sistema de áreas seguras

Todo el HUD de partida se ubica con variables CSS definidas en `body.ras-arena`:

```css
--rg-boost       /* escala tipográfica y de controles (1 en pantalla normal) */
--rg-x           /* margen lateral adaptable (clamp 12–28 px, 3.6vmin) */
--rg-y           /* margen superior adaptable (clamp 14–32 px, 4.2vmin) */
--rg-gap         /* separación entre paneles de la columna izquierda */
--rg-act-h       /* alto del botón de interacción */
--rg-act-bottom  /* distancia del botón al borde inferior */
--rg-act-lift    /* elevación extra del botón (solo retrato angosto) */
--rg-safe-l/r/t/b/* env(safe-area-inset-*) reales */
```

Reglas:

- **Nada de `top` fijos en píxeles** para el HUD: los márgenes usan `clamp()` con
  `vmin`, así crecen en pantallas grandes y se aprietan en las chicas sin perder
  legibilidad.
- `#rg-left` es una **columna flexible** (`display: flex; flex-direction: column`)
  que contiene marcador → pedido → “llevás”. El pedido ya no tiene un `top`
  propio: baja solo si el marcador crece, y nunca se sale por el borde.
- `#rg-time` sigue anclado arriba a la derecha, con el mismo margen seguro.
- `#rg-toast` (avisos) queda debajo de la fila superior y `#rg-hint` justo encima
  del botón de interacción: no se pisan.
- En pantallas de poca altura (`max-height: 460px`) se reduce el **aire**
  (padding), no el tamaño de lectura.
- En retrato angosto (`max-width: 560px and orientation: portrait`) el botón se
  eleva por encima del joystick con `--rg-act-lift`; en horizontal y en tablets
  queda centrado abajo, sin elevación.

---

## 3. Botón JUGAR / RECOGER / ENTREGAR

- Centrado horizontal real: `left: 50%` + `translate(calc(-50% + var(--rg-dx)),
  var(--rg-dy))`.
- `--rg-dx` / `--rg-dy` los escribe `placeOverlays` en el modo plano para
  desplazar el centro del marco cuando la escena no ocupa toda la ventana. No se
  pisa el `transform` con estilos inline, así que `:active` sigue funcionando.
- Área táctil mínima: `min-width: clamp(140px, 34vmin, 200px)` y alto
  `clamp(56px, 9vmin, 72px)`; en las pruebas se exige ≥ 120×50 px.
- Feedback visual: escala 0.97 al presionar; colores por acción (`go`, `take`,
  `give`).
- En VR cada ojo recibe su propia copia del botón, centrada en el ojo.

---

## 4. Legibilidad y jerarquía

| Elemento | Antes | Ahora |
|---|---|---|
| Marcador (número) | 30 px fijo | `clamp(30px, 7.6vmin, 38px)` · peso 900 |
| Etiquetas JUGADOR/BOT | 10 px | 11 px · peso 800 · opacidad 0.8 |
| Reloj | 28 px | `clamp(28px, 7vmin, 36px)` · peso 900 · tabular |
| Pedido (nombre) | 21 px | `clamp(21px, 5vmin, 27px)` · peso 900 · elipsis si no entra |
| “Llevás” | 13 px | `clamp(14px, 3.4vmin, 17px)` · peso 800 |
| Aviso central | `clamp(15px, 4.6vw, 21px)` | `clamp(21px, 4.6vmin, 26px)` · peso 800 |
| Pista de interacción | 13.5 px | `clamp(14px, 3.4vmin, 17px)` · peso 700 |
| Resultado (título) | 24 px | `clamp(25px, 6.4vmin, 32px)` |
| Resultado (puntajes) | 44 px | `clamp(44px, 11vmin, 56px)` |

Además: `text-shadow` suave en los paneles, fondo más opaco (0.86) y borde más
marcado para separar del pasillo 3D, sin cambiar la identidad visual.

Los textos largos usan `max-width`, `overflow: hidden` y `text-overflow:
ellipsis` donde corresponde (pedido y “llevás”), para que nunca se corten a la
mitad ni empujen el layout.

---

## 5. Adaptación a VR Box / SBS

En modo VR con HUD **por ojo**:

- El HUD y el panel de resultado se clonan **1:1 dentro del rectángulo de cada
  ojo** (`transform: scale(1)`, no `scale(eyes[0].w / stage.w)`). El `scale(1)`
  se mantiene a propósito porque un `transform` convierte al contenedor en el
  bloque de referencia de los hijos `position: fixed`.
- **JUGAR también se espeja**: cada ojo tiene su copia centrada y dentro de su
  área segura.
- `--rg-boost: 1.28` en las copias por ojo: cada ojo mide la mitad del ancho y
  las lentes acercan la imagen, así que los textos se agrandan sin invadir el
  centro.
- `--rg-y` toma como mínimo `5.5vh`, la guía de lente usada por el modo VR.
- Las áreas seguras laterales se **anulan en el borde interior** de cada ojo y se
  vuelven a aplicar solo en el borde exterior: el centro de la pantalla no tiene
  notch.
- El reloj se corre 52 px hacia adentro para no chocar con el ⚙, que queda
  intacto en el borde.
- Los toques sobre las copias se reenvían al botón real (el original sigue a
  `opacity: 0` y es el que ejecuta el juego), así que el mando y los toques
  siguen funcionando igual.
- El **menú de pausa** conserva su comportamiento escalado anterior: es
  configuración, no gameplay, y queda fuera de este alcance.

No se tocó cámara, IPD, convergencia, intensidad 3D, separación SBS ni el
renderizado estereoscópico.

---

## 6. Elementos deliberadamente intactos

- Botón ⚙ de opciones y panel de dificultad.
- Panel VR, pestañas, sliders y controles de calibración.
- Calibrador Windows (UI, sliders, perfiles, bloqueo).
- Joystick táctil, botón de correr y pausa.
- Cámara, SBS, IPD, convergencia, intensidad 3D, distorsión.
- Mecánicas, reglas, puntaje, bot, CNC, Bluetooth y gamepad.
- Posición de los controles de configuración en los bordes.

---

## 7. Archivos afectados

| Archivo | Cambio |
|---|---|
| `android/app/src/main/assets/www/android/android-game.css` | fuente canónica: safe areas, columna `#rg-left`, JUGAR centrado, tipografía, resultado |
| `android/app/src/main/assets/www/android/game.js` | `buildUI()` envuelve marcador/pedido/“llevás” en `#rg-left` (ids intactos) |
| `android/app/src/main/assets/www/index.html` | `start()` oculta el logo si la partida ya está activa (carrera real) |
| `web/vr/vr-preview.js` | `syncMirror(..., 'eye' \| 'scaled')`, espejo de `#rg-act`, `forwardTap`, `--rg-dx/dy`, `state().mirrors.act` |
| `web/vr/vr-preview.css` | original de `#rg-act` oculto, copias y botones con `pointer-events` |
| `tools/build-ios.js` | el `buildId` del service worker incluye `game.js`, `android-game.css`, `vr-preview.js` y `vr-preview.css` |
| `tools/test-suite.js` | T24 y T25 |
| `tools/test-vr-suite.js` | V08c reforzado y V08e |
| `tools/test-web.js` | captura `ui-01-jugar.png` y chequeo de JUGAR/HUD en horizontal |

En la fase V18 se suman `game.js` (datos, panel y API `RasmaticGame.ui`),
`android-game.css` (variables por elemento y panel `#rg-ui`), `test-suite.js`
(T26–T30), `test-vr-suite.js` (V26) y `test-web.js` (capturas `ui-02` y `ui-03`).
El detalle está en `docs/ui-personalization.md`.

Las copias `web/mobile/` y `ios/RasmaticLugar3D/www/` se regeneran con
`node tools/build-ios.js`; `check-xcode` exige que sean idénticas byte a byte.

---

## 8. Pruebas

| Suite | Resultado |
|---|---|
| `node tools/test-web.js` | **30/30** + horizontal + offline, consola sin errores |
| `node tools/test-vr.js` | **34/34** |
| `node tools/test-pad.js` | **21/21** |
| `node tools/check-xcode.js` | **123/123** |
| `npm test` (windows-calibrator) | **62/62** |
| Smoke del instalador (`--smoke`) | **14/14 PASS** |

Tests nuevos o ampliados:

- **T24** — JUGAR centrado (≤ 1,5 px del centro), dentro de la ventana con 8 px de
  margen, área táctil ≥ 120×50 px y sin solaparse con el joystick.
- **T25** — todos los paneles del HUD dentro del área segura, fuentes mínimas
  (marcador ≥ 28 px, reloj ≥ 26 px, pedido ≥ 20 px) y sin desbordes.
- **V08c** — HUD por ojo **1:1** dentro del rectángulo del ojo, con el original
  oculto, paneles dentro del área segura y fuentes ≥ 32/30 px.
- **V08e** — JUGAR espejado, centrado en cada ojo, en la mitad inferior, dentro
  del área segura y con el original oculto.
- **T26–T30** — tamaño, posición y límites, persistencia versionada, separación
  de perfiles/restauración y aplicación en vivo sin romper la partida (V18).
- **V26** — la personalización VR se duplica 1:1 en ambos ojos, el perfil normal
  no altera la vista VR y no cambia IPD ni convergencia (V18).
- **Horizontal** — además del canvas a pantalla completa, JUGAR centrado sin
  tapar el joystick y reloj/marcador sin solaparse.

Evidencias nuevas: `docs/evidencias/ui-01-jugar.png` (JUGAR centrado),
`docs/evidencias/ui-02-personalizacion.png` y `ui-03-personalizacion-vr.png`
(panel de personalización en ambos modos) e `ios-04-horizontal.png` regenerada.

---

## 9. Limitaciones

- No hay iPhone ni VR Box físicas: **no se verificó la legibilidad óptica real**
  a través de las lentes, ni el recorte físico del campo de visión.
- Las safe areas se probaron con los valores que reporta Chromium; en Safari/iOS
  los valores reales del notch y la barra de gestos pueden variar.
- El modo VR se validó en Chromium con WebGL por software, no en WKWebView.
- El instalador NSIS se generó y se probó `win-unpacked --smoke`, pero no se
  ejecutó el instalador completo en una máquina limpia.
