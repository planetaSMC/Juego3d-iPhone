# Personalización de interfaz (fase V18)

Este documento explica el panel **PERSONALIZACIÓN DE INTERFAZ**: cómo abrirlo,
qué elementos se pueden ajustar, cómo funcionan los perfiles normal y VR, dónde
se guardan los cambios y qué limitaciones tiene.

La personalización **solo cambia cómo se dibuja el HUD**. No modifica la partida,
el bot, las dificultades, los pedidos, el puntaje, el movimiento, el joystick, el
mando, la cámara, el render SBS, el IPD, la convergencia, la intensidad 3D ni la
distorsión óptica.

---

## 1. Cómo acceder

1. Abrir el juego y quedarse en el vestíbulo (estado `idle`, antes de pulsar
   **JUGAR**). El engranaje **⚙** de opciones solo está visible ahí.
2. Pulsar **⚙**.
3. Elegir **PERSONALIZACIÓN DE INTERFAZ**.

El panel se abre sobre la escena y tiene scroll interno en pantallas pequeñas.
El botón **✕** y **CANCELAR** cierran sin guardar y vuelven a Opciones.

> La personalización no está disponible durante la partida para no tapar el HUD
> ni interferir con los controles. Los ajustes guardados sí se aplican en la
> siguiente partida y en caliente desde la API de pruebas.

---

## 2. Elementos configurables

| Id | Elemento | Tamaño | Posición | Grosor | Contraste | Fondo |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `score` | Marcador (panel JUGADOR / BOT) | sí | sí | — | sí | sí |
| `points` | Puntaje (números) | sí | sí | sí | sí | — |
| `time` | Reloj y temporizador | sí | sí | sí | sí | sí |
| `req` | Información del pedido | sí | sí | — | sí | sí |
| `med` | Nombre del medicamento | sí | sí | sí | sí | — |
| `carry` | “Lo que llevás” | sí | sí | sí | sí | sí |
| `toast` | Mensajes y notificaciones | sí | sí | sí | sí | sí |
| `hint` | Indicaciones y pistas | sí | sí | sí | sí | sí |
| `act` | Botones **JUGAR / RECOGER / ENTREGAR** | sí | sí | sí | sí | — |
| `end` | Resultado de la partida | sí | sí | sí | sí | sí |

Los botones de configuración que ya estaban deliberadamente en los bordes
(⚙, VR, pausa) **no** forman parte de esta personalización.

### Qué significa cada control

- **Tamaño** — escala de 60 % a 150 % en pasos de 5 %, con botones **−** y **+**.
  En el marcador, el pedido y “llevás” se aplica con `transform: scale()` y un
  margen compensatorio para que la columna no se solape. En el puntaje y en el
  nombre del medicamento se aplica al `font-size`, para que el texto siga
  creciendo de forma natural.
- **Horizontal / Vertical** — desplazamiento de −40 px a +40 px en pasos de 2 px,
  con botones de dirección, **CENTRAR** y ajuste fino con los extremos del
  control. Los desplazamientos se recortan con `clamp()` contra el área visible:
  un valor extremo nunca saca el elemento de la pantalla.
- **Grosor de fuente** — `Heredado` (0), 400, 500, 600, 700, 800 o 900, solo en
  los elementos que lo admiten.
- **Contraste** — 80 % a 140 %.
- **Fondo** — opacidad del fondo del panel, de 0 % a 100 %. Los elementos sin
  panel propio no muestran este control.

---

## 3. Vista previa en tiempo real

El panel incluye dos previsualizaciones con las proporciones reales de cada modo:

- **PANTALLA NORMAL** — un marco vertical 390×844 equivalente al viewport del
  iPhone.
- **VR / SBS** — dos marcos idénticos, uno por ojo, con la misma relación de
  aspecto que usa el modo estéreo.

Cada cambio de control se refleja inmediatamente en ambas previsualizaciones.
El borrador **no toca la partida real**: solo se aplica al pulsar **APLICAR**.
El botón **VISTA PREVIA: SÍ / NO** oculta o muestra las previsualizaciones para
ganar espacio en pantallas pequeñas.

La vista previa muestra los siete elementos representativos: marcador, puntaje,
reloj, pedido, medicamento, “llevás”, mensaje, pista y botón de interacción.

---

## 4. Perfiles

Hay dos perfiles editables e independientes:

| Perfil | Cuándo se usa |
|---|---|
| **PANTALLA NORMAL** | Juego en pantalla normal (sin `body.vr-on`) |
| **VR / SBS** | Modo VR Box activo (`body.vr-on`) |

El panel abre automáticamente el perfil que corresponde al modo actual y permite
cambiar de pestaña para editar el otro sin salir del modo.

- Cada perfil conserva sus propios valores; cambiar uno no altera el otro.
- El **perfil predeterminado de fábrica** (todo al 100 %, sin desplazamiento) se
  recupera con **RESTABLECER TODO**. No es un tercer perfil editable.
- **RESTABLECER ELEMENTO** devuelve solo el elemento seleccionado a sus valores
  de fábrica, en el perfil activo.
- **RESTABLECER TODO** devuelve ambos perfiles a fábrica.

Cambiar de perfil o restablecer no modifica mecánicas, controles ni partida.

---

## 5. Botones del panel

| Botón | Acción |
|---|---|
| **APLICAR** | Normaliza, guarda en `localStorage`, aplica las variables CSS y vuelve a Opciones |
| **CANCELAR** | Descarta el borrador y vuelve a Opciones |
| **RESTABLECER ELEMENTO** | Devuelve el elemento seleccionado a fábrica (en el borrador) |
| **RESTABLECER TODO** | Devuelve ambos perfiles a fábrica (en el borrador) |
| **VISTA PREVIA: SÍ / NO** | Muestra u oculta las previsualizaciones |

Nada se guarda hasta pulsar **APLICAR**. **CANCELAR** y **✕** descartan el
borrador completo.

---

## 6. Guardado y persistencia

- Clave: `rasmatic.ui.v1`.
- Estructura versionada:

```json
{
  "v": 1,
  "profiles": {
    "normal": { "score": { "scale": 1, "dx": 0, "dy": 0, "weight": 0, "contrast": 1, "bg": null }, "...": {} },
    "vr":     { "score": { "scale": 1.2, "dx": 4, "dy": -6, "weight": 0, "contrast": 1.1, "bg": 0.9 }, "...": {} }
  }
}
```

- Se lee al arrancar (`uiLoad()` dentro de `boot()`), así los ajustes valen para
  la primera partida sin reiniciar la escena.
- Aplicar cambios escribe variables CSS en `<html>` (`--ui-<id>-s/x/y/w/c/b`) y,
  para VR, el sufijo `v` (`--ui-<id>-sv/xv/yv/wv/cv/bv`). No se reconstruye la
  escena ni se reinicia la partida.
- Valores inválidos, `null`, tipos equivocados, versiones antiguas o un JSON
  corrupto se normalizan a los predeterminados sin lanzar errores. Los campos
  desconocidos se ignoran y los perfiles ausentes se completan con fábrica.
- Actualizar la PWA no borra la clave: el service worker cambia el caché del
  código, no `localStorage`.

Rangos normalizados:

| Campo | Rango | Predeterminado |
|---|---|---|
| `scale` | 0,60 – 1,50 | 1,00 |
| `dx`, `dy` | −40 – +40 px | 0 |
| `contrast` | 0,80 – 1,40 | 1,00 |
| `weight` | 0, 400, 500, 600, 700, 800, 900 | 0 (heredado) |
| `bg` | 0 – 1 (`null` = fondo original) | `null` |

---

## 7. VR / SBS

- El perfil VR se aplica a las dos copias del HUD (ojo izquierdo y derecho) con
  la **misma escala y la misma posición relativa**.
- Las copias siguen dentro de las áreas seguras de cada ojo; los límites usan
  las mismas variables de safe area que la fase V17.
- El panel de personalización también se previsualiza dentro de cada ojo y no
  puede quedar fuera del campo visible.
- Ajustar tamaño o posición **no cambia** la separación de cámaras, el IPD, la
  convergencia, la intensidad 3D ni la distorsión.
- No hay elementos que aparezcan en un solo ojo: la copia se genera desde el
  mismo nodo y los mismos valores.

---

## 8. API pública (pruebas y automatización)

```js
RasmaticGame.ui.state()                  // { version, active, profiles }
RasmaticGame.ui.elements()               // lista de elementos y capacidades
RasmaticGame.ui.get('normal' | 'vr')     // copia del perfil
RasmaticGame.ui.set(perfil, id, patch, { save, apply })
RasmaticGame.ui.setProfile(perfil, datos, { save, apply })
RasmaticGame.ui.reset(perfil, id | null, { save, apply })
RasmaticGame.ui.load()                   // relee localStorage y aplica
RasmaticGame.ui.open() / close(back)
```

`save` y `apply` valen `true` por omisión. Los tests usan `{ save: false }` para
no contaminar la preferencia del equipo.

---

## 9. Archivos afectados

| Archivo | Cambio |
|---|---|
| `android/app/src/main/assets/www/android/game.js` | datos, normalización, persistencia, aplicación, panel y `RasmaticGame.ui` |
| `android/app/src/main/assets/www/android/android-game.css` | variables por elemento, reglas normales y `body.vr-on`, panel `#rg-ui` y previsualizaciones |
| `web/mobile/game.js` y `web/mobile/android-game.css` | copias byte a byte generadas por `tools/build-ios.js` |
| `ios/RasmaticLugar3D/www/` | espejo iOS generado |
| `tools/test-suite.js` | T26–T30 |
| `tools/test-vr-suite.js` | V26 |
| `tools/test-web.js` | capturas `ui-02-personalizacion.png` y `ui-03-personalizacion-vr.png` |

---

## 10. Pruebas

| Suite | Resultado |
|---|---|
| `node tools/test-web.js` | **30/30** + horizontal + offline |
| `node tools/test-vr.js` | **34/34** + mouse + `?vr=1` |
| `node tools/test-pad.js` | **21/21** |
| `node tools/check-xcode.js` | **123/123** |
| `npm test` (windows-calibrator) | **62/62** |
| Smoke del instalador | **14/14 PASS** |

Casos específicos de la fase:

- **T26** — tamaño individual del marcador (≥ 1,15×) y del puntaje (tipografía
  ≥ 1,2×).
- **T27** — desplazamiento exacto +20/+15 px y extremos −40/+40 px recortados
  dentro de la ventana.
- **T28** — persistencia versionada (`v:1`), recarga desde `localStorage` y
  normalización de valores inválidos.
- **T29** — perfiles normal (1,25) y VR (0,8) independientes; restablecer un
  elemento o un perfil no toca al otro.
- **T30** — aplicar en vivo no rompe la partida, el joystick ni la Gamepad API;
  los cinco botones existen, la vista previa alterna, CANCELAR descarta y
  APLICAR cierra.
- **V26** — personalización VR duplicada 1:1 en ambos ojos, perfil normal sin
  efecto en VR e IPD/convergencia intactos.

Evidencias: `docs/evidencias/ui-02-personalizacion.png` (perfil normal) y
`docs/evidencias/ui-03-personalizacion-vr.png` (perfil VR/SBS).

---

## 11. Limitaciones

- **No se verificó la legibilidad óptica real en VR Box**: no hay iPhone ni gafas
  físicas en el entorno de desarrollo. Las pruebas son en Chromium con WebGL por
  software. La comodidad final debe confirmarse con las lentes puestas.
- Las áreas seguras se probaron con los valores que reporta Chromium; en
  Safari/iOS los márgenes reales del notch y la barra de gestos pueden variar.
- La personalización no está pensada para editarse durante la partida: se abre
  desde Opciones en el vestíbulo.
- El instalador NSIS se regeneró y se probó `win-unpacked --smoke`; no se
  ejecutó el instalador completo en una máquina limpia.
