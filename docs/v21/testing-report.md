# V21 · Informe de pruebas

Fecha: 2026-11-26. Entorno: Windows, Node 24.22.0, Edge headless
(`--use-angle=swiftshader`), sin macOS/Xcode ni iPhone físico.

## 1. Resumen

| Suite | Resultado |
|---|---|
| `node tools/test-v21.js` | **14 / 14** |
| `node tools/test-v20.js` | **18 / 18** |
| `node tools/test-web.js` | **30 / 30** + horizontal |
| `node tools/test-vr.js` | **34 / 34** |
| `node tools/test-pad.js` | **21 / 21** |
| `node tools/check-xcode.js` | **154 / 154** |
| `windows-calibrator && npm test` | **62 / 62** |

## 2. Suite V21 (14 casos)

| Caso | Comprueba |
|---|---|
| V21-01 | arranque en menú, sin partida automática, reloj 3:00 |
| V21-02 | INICIAR, 3 → 2 → 1, reloj congelado en 180 y partida al final |
| V21-03 | tres clientes en sus slots y pedido visible como imagen real |
| V21-04 | mira + contorno, desaparición al mirar afuera, sin etiquetas |
| V21-05 | colocar en cinta, `s` avanza, velocidad > 0, mano vacía |
| V21-06 | empleado recoge, valida, entrega y cambia el pedido |
| V21-07 | la fila avanza, el siguiente queda activo y se repone |
| V21-08 | medicamento equivocado no suma y vuelve al stock |
| V21-09 | dos paquetes en la cinta con separación ≥ 1,5 |
| V21-10 | FARMACIA RASMATIC, sin cinta de máquina, escalas y cajas de color |
| V21-10b | rendimiento con escena, fila y tres clientes |
| V21-11 | VR SBS conserva mira por ojo y `aimQuaternion` con HT |
| V21-12 | cuenta regresiva visible en cada ojo de VR |
| V21-13 | rendimiento estable después de salir de VR |

Evidencias: `docs/evidencias/v21/v21-menu.png`,
`v21-countdown.png`, `v21-aim.png`, `v21-belt.png`, `v21-queue.png`.

## 3. Compatibilidad con V20.1

- `test-v20.js` 18/18: identidad, escena, colisiones, tres modos, tres
  dificultades, partida, joystick, Head Tracking y puente Windows.
- `test-web.js` 30/30: HUD, menú, recoger, cinta, entrega correcta e incorrecta,
  bot/CNC, fin, revancha, joystick, cámara, pausa, mando, safe areas, offline,
  panel de dificultad, HUD personalizado y horizontal.
- `test-vr.js` 34/34: SBS, IPD, convergencia, distorsión, perfiles, cámara,
  intensidad 3D, lentes, HUD por ojo, Head Tracking en el panel, controles,
  rendimiento y vuelta a la partida.
- `test-pad.js` 21/21: mando nativo, botones, sticks, conexión/desconexión,
  VR y salida segura.
- Calibrador Windows: 62/62 (spec, protocolo, `rev`/`ack`, bloqueo, Expo,
  reconexión y persistencia).

## 4. Rendimiento medido

Vista de arranque con 3 clientes en cola, 1 jugador, empleado, cinta y escena
completa:

| Métrica | Valor |
|---|---|
| Draw calls | **681** |
| Triángulos | **72.330** |
| Mallas | **1.041** |
| Texturas | **47** |

Es una medición con WebGL por software (SwiftShader), no FPS de iPhone. La
La escena base V20 medía 521 draw calls / 79.300 triángulos. V21 suma unos 160
draw calls de personajes; con el detalle bajo 16×12 para clientes y empleado los
triángulos bajan a 72.330. El coste principal son los draw calls (en VR SBS se
duplican). No se crean geometrías ni materiales por fotograma:

- geometría compartida para paquetes;
- materiales por medicamento desde `drugKit` (caché);
- un solo grupo de contorno reutilizado;
- pool de 4 paquetes y 6 clientes;
- raycasting limitado a 10 Hz y a las cajas + mallas fusionadas.

## 5. VR y Head Tracking

- La mira usa `RasmaticVR.aimQuaternion()`, que en VR activo aplica el offset de
  Head Tracking sobre la cámara base.
- El HUD se clona por ojo; la mira (`#v21-aim`) y la cuenta regresiva aparecen
  en ambos ojos.
- El rayo no modifica `PP.yaw/pitch` ni la posición del jugador.
- `test-vr` sigue verificando IPD, convergencia, HUD por ojo e intensidad 3D.

## 6. Compilación iOS

V21 se compiló en GitHub Actions con Xcode 16.4:

| Dato | Valor |
|---|---|
| Run | [45880086744](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/45880086744) |
| Resultado | **BUILD SUCCEEDED** |
| IPA | `RASMATIC-VR-unsigned.ipa` |
| Tamaño | **840.012 bytes** |
| SHA-256 | `4287E5FEDBAD064EECA6E1B8D7C96B2C866B30623A86C6250232EF9FFB533588` |
| `verify-ipa.js` | **OK** (bundle, Mach-O, 15 archivos clave, `www/v21/v21.css`) |

Copia local ignorada por Git: `dist/RASMATIC-VR-unsigned.ipa`.

## 7. Qué no se probó

- Instalación en iPhone físico.
- Sensores Core Motion reales, mando Bluetooth físico y VR Box física.
- FPS y consumo reales en GPU de iPhone.
- Percepción visual subjetiva del contorno y de la escala en una pantalla real.
