# V21 · Informe de pruebas

Fecha: 2026-11-26. Entorno: Windows, Node 24.22.0, Edge headless
(`--use-angle=swiftshader`), sin macOS/Xcode ni iPhone físico.

## 1. Resumen

| Suite | Resultado |
|---|---|
| `node tools/test-v21.js` | **19 / 19** |
| `node tools/test-v20.js` | **18 / 18** |
| `node tools/test-web.js` | **30 / 30** + horizontal |
| `node tools/test-vr.js` | **34 / 34** |
| `node tools/test-pad.js` | **23 / 23** |
| `node tools/check-xcode.js` | **164 / 164** |
| `windows-calibrator && npm test` | **62 / 62** |

## 2. Suite V21 (19 casos)

| Caso | Comprueba |
|---|---|
| V21-01 | arranque en menú, sin partida automática, reloj 3:00 |
| V21-02 | INICIAR, 3 → 2 → 1, reloj congelado en 180 y partida al final |
| V21-03 | tres clientes en sus slots y pedido visible como imagen real |
| V21-04 | mira + contorno, desaparición al mirar afuera, sin etiquetas |
| V21-05 | colocar en cinta sin cambiar el pedido; `s` avanza, caja real e identidad estable |
| V21-06 | empleado recoge, valida, entrega y cambia el pedido |
| V21-07 | la fila avanza, el siguiente queda activo y se repone |
| V21-08 | medicamento equivocado no suma y vuelve al stock |
| V21-09 | dos paquetes en la cinta con separación ≥ 1,5 |
| V21-10 | FARMACIA RASMATIC, sin cinta de máquina, escalas y cajas de color |
| V21-10b | rendimiento con escena, fila y tres clientes |
| V21-11 | VR SBS conserva mira por ojo y `aimQuaternion` con HT |
| V21-12 | cuenta regresiva visible en cada ojo de VR |
| V21-13 | rendimiento estable después de salir de VR |
| V21-14 | 330 cajas individuales con identidad única, sin fusión |
| V21-15 | solo las 3 estanterías habilitadas; sin soltura libre; bloqueo y devolución |
| V21-16 | entregar una copia individual del medicamento exacto pedido |
| V21-17 | el pedido no cambia al colocar: se mantiene hasta la entrega |
| V21-18 | con una caja en tránsito, el HUD conserva el pedido colocado y recién muestra el siguiente al quedar libre la cinta |

Evidencias: `docs/evidencias/v21/v21-menu.png`,
`v21-countdown.png`, `v21-aim.png`, `v21-belt.png`, `v21-queue.png`.

## 3. Compatibilidad con V20.1

- `test-v20.js` 18/18: identidad, escena, colisiones, tres modos, tres
  dificultades, partida, joystick, Head Tracking y puente Windows.
- `test-web.js` 31/31: HUD, menú, recoger, cinta, entrega correcta e incorrecta,
  bot/CNC, fin, revancha, joystick, cámara, pausa, mando, safe areas, offline,
  panel de dificultad, HUD personalizado y horizontal.
- `test-vr.js` 34/34: SBS, IPD, convergencia, distorsión, perfiles, cámara,
  intensidad 3D, lentes, HUD por ojo, Head Tracking en el panel, controles,
  rendimiento y vuelta a la partida.
- `test-pad.js` 23/23: mando nativo, botones, sticks, conexión/desconexión,
  selección/agarre/soltura con A, lo mismo en VR Box, VR y salida segura.
- Calibrador Windows: 62/62 (spec, protocolo, `rev`/`ack`, bloqueo, Expo,
  reconexión y persistencia).

## 4. Rendimiento medido

Vista de arranque con 3 clientes en cola, 1 jugador, empleado, cinta y escena
completa:

| Métrica | Valor |
|---|---|
| Draw calls | **543** |
| Triángulos | **69.786** |
| Mallas | **1.275** |
| Texturas | **32** |

Es una medición con WebGL por software (SwiftShader), no FPS de iPhone. La
cámara del arranque ve la escena completa; en otras orientaciones el culling
frustum reduce mucho el número. V21.1 suma 330 mallas individuales (una por
caja) y por eso las mallas suben de 1.041 a 1.275, pero el atlas por medicamento
mantiene una sola llamada de dibujo por caja y baja las texturas de 47 a 32.
No se crean geometrías ni materiales por fotograma:

- geometría atlas compartida para todas las cajas;
- un material por medicamento desde `drugKit` (caché);
- un solo grupo de contorno reutilizado;
- pool de 4 paquetes y 6 clientes;
- raycasting limitado a 10 Hz sobre las cajas visibles.

## 5. VR y Head Tracking

- La mira usa `RasmaticVR.aimQuaternion()`, que en VR activo aplica el offset de
  Head Tracking sobre la cámara base.
- El HUD se clona por ojo; la mira (`#v21-aim`) y la cuenta regresiva aparecen
  en ambos ojos.
- El rayo no modifica `PP.yaw/pitch` ni la posición del jugador.
- `test-vr` sigue verificando IPD, convergencia, HUD por ojo e intensidad 3D.

## 6. Compilación iOS

### V21.1 (rama actual)

V21.1 se compiló en GitHub Actions (Xcode 16.4) sobre el PR #4:

| Dato | Valor |
|---|---|
| Run | [45890568451](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/45890568451) |
| Resultado | **BUILD SUCCEEDED** |
| IPA | `RASMATIC-VR-unsigned.ipa` |
| Tamaño | **843.351 bytes** |
| SHA-256 | `A0F91D19A4DAAC2BB025A58A0578DCCFE1206F343804968283ECCB8C9101C7D9` |
| `verify-ipa.js` | **OK** (bundle, Mach-O, 15 archivos clave) |
| Contenido | `www/mobile/game.js` y `www/v20/pharmacy-scene.js` coinciden con `web/` (normalizando CRLF/LF) |

Corrección del pedido estable (cajas en tránsito):

| Dato | Valor |
|---|---|
| Run | [46041477056](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/46041477056) |
| Resultado | **BUILD SUCCEEDED** |
| IPA | `RASMATIC-VR-unsigned.ipa` |
| Tamaño | **844.124 bytes** |
| SHA-256 | `0AE2BF4B2654B0D17D84AD705937695607F90C128F94940CD96FA81FB42DEDC1` |
| `verify-ipa.js` | **OK** |
| Contenido | `www/mobile/game.js` coincide con `web/` (normalizando CRLF/LF) e incluye `requestLock` y `lastPlaceMs` |

La compilación de V21 en `main` que sigue es la referencia histórica.

### V21 en `main`

V21 se compiló en GitHub Actions con Xcode 16.4:

| Dato | Valor |
|---|---|
| Run del código | [45880086744](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/45880086744) |
| Run de la rama final | [45880239776](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/45880239776) |
| Resultado | **BUILD SUCCEEDED** |
| IPA | `RASMATIC-VR-unsigned.ipa` |
| Tamaño | **840.012 bytes** |
| SHA-256 (run del código) | `4287E5FEDBAD064EECA6E1B8D7C96B2C866B30623A86C6250232EF9FFB533588` |
| SHA-256 (rama final) | `66714AB0699EB0040B079E35DE4E4D7866469A17426D5B87CF7CAEC0A6E94F05` |
| Nota | El hash varía por marcas de tiempo; el tamaño y el contenido son los mismos |
| `verify-ipa.js` | **OK** (bundle, Mach-O, 15 archivos clave, `www/v21/v21.css`) |

Copia local ignorada por Git: `dist/RASMATIC-VR-unsigned.ipa`.

## 7. Compilación Windows

El workflow **Windows VR Calibrator (V21)** se ejecutó en `windows-latest` y
terminó en verde:

| Dato | Valor |
|---|---|
| Run | [45884702784](https://github.com/planetaSMC/Juego3d-iPhone/actions/runs/45884702784) |
| Pruebas | **62/62** |
| Instalador | `RASMATIC VR Calibrator Setup 1.0.0.exe` |
| Tamaño | **82.022.901 bytes** |
| SHA-256 | `053C84A4C908C4AA26F805DAC2DC7BD0D8C850DBA12BA88C4E3619A28049946F` |
| Artefacto | `rasmatic-windows-calibrator` |
| Firma | sin firmar |

## 8. Qué no se probó

- Instalación en iPhone físico.
- Sensores Core Motion reales, mando Bluetooth físico y VR Box física.
- Agarrar, soltar y volver a agarrar con un mando físico real.
- FPS y consumo reales en GPU de iPhone.
- Percepción visual subjetiva del contorno y de la escala en una pantalla real.
