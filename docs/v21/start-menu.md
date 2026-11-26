# V21 · Menú de inicio y cuenta regresiva

## 1. Estados

```
boot → menu → countdown → playing → over
                    ↑                 │
                    └── revancha ─────┘
over → menú (botón atrás / volver)
```

- **menu:** se muestra el menú; el jugador no se mueve y el reloj está en 3:00.
- **countdown:** cuenta 3, 2, 1; el reloj sigue congelado.
- **playing:** `matchStart` se fija recién al terminar la cuenta; el reloj
  empieza en 3:00.
- **over:** resultado; “Revancha” vuelve a `menu` y lanza una nueva cuenta.

El antiguo inicio por proximidad al encargado quedó eliminado. El encargado ya
no tiene el cartel JUGAR y `updatePrompt` no ofrece esa acción.

## 2. Menú

Elemento `#v21-start` dentro del HUD, con:

- marca RASMATIC VR;
- título “FARMACIA VIRTUAL”;
- explicación breve;
- tres botones de dificultad (Fácil / Normal / Difícil) conectados a
  `applyDifficulty`;
- botón grande **INICIAR**;
- nota de modos y VR BOX.

El fondo del menú es opaco; tapa el HUD, el joystick y los botones externos sin
necesidad de ocultarlos con `display:none` (se evitó alternar capas fijas que
provocaban bloqueos de rAF en Chromium/SwiftShader).

## 3. Cuenta regresiva

`#v21-countdown` se mantiene montada y cambia de opacidad, no de `display`.
El número está en `#v21-count-num`.

- Al pulsar INICIAR: `state = countdown`, `countdownAt = now()`.
- `updateCountdown` calcula `n = 3 - floor(elapsed)`.
- Cambia el número y reinicia la animación CSS (`tick`).
- A los 3 s llama a `begin()`.
- `begin()` fija `matchStart` y `matchEnd`; el reloj no descuenta tiempo de
  cuenta regresiva.
- El overlay queda con `opacity:0` y `pointer-events:none` al comenzar.

La animación es un `scale`/`opacity` de 1 s; el tamaño es fluido (hasta 42 vh) y
está centrado.

## 4. VR

El menú y la cuenta viven **dentro de `#rg-hud`**, que es el nodo que
`vr-preview.js` clona por ojo. Por eso:

- el botón INICIAR aparece en cada ojo;
- la cuenta 3-2-1 aparece en cada ojo;
- el clon reenvía el toque al botón original (`forwardTap`);
- el HUD no se duplica fuera de los ojos.

`syncMirror` reconstruye la copia cuando cambia el HTML/texto o la clase del
HUD; se añadieron `v21-menu-open` / `v21-countdown-open` al HUD para forzar la
actualización aunque el texto sea el mismo.

## 5. Bloqueo del jugador

`RasmaticCore.updatePlace` consulta `RasmaticGame.isInputLocked()`:

- `menu` y `countdown` → no se mueve, no gira con teclado/joystick/mando.
- La cámara sigue existiendo para que el Head Tracking no se rompa.
- El puntero sobre el canvas no gira la cámara mientras el menú/cuenta está
  activo.

## 6. Archivos

- `web/mobile/game.js`: `showMenu`, `startCountdown`, `updateCountdown`,
  `begin`, `isInputLocked`.
- `web/v21/v21.css`: `.v21-menu`, `#v21-countdown`, animación `v21-count`.
- `web/v20/pharmacy-core.js`: bloqueo de movimiento.
- `web/vr/vr-preview.js`: espejo del HUD.

## 7. Pruebas

- V21-01: arranque en menú, sin partida automática.
- V21-02: INICIAR, 3-2-1 y reloj congelado en 180.
- V21-12: cuenta regresiva visible en cada ojo de VR.
- test-web T03/T04: menú y cuenta; test-web horizontal.
- test-vr V10b: Espacio inicia la cuenta.
