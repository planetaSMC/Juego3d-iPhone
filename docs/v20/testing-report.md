# V20 · Informe de pruebas

Fecha de ejecución: **2026-11-26**.

## 1. Entorno

| Dato | Valor |
|---|---|
| Sistema | Windows (PC de desarrollo) |
| Node.js | 24.22.0 |
| Navegador de pruebas | Microsoft Edge headless (`--use-angle=swiftshader`) |
| Viewport móvil | 390 × 844 (retrato) y 844 × 390 (horizontal) |
| Windows Calibrator | `node --test` (Electron no requerido para la suite) |
| macOS / Xcode | **no disponible** |
| iPhone físico | **no disponible** |
| VR Box física | **no disponible** |

Todo lo que sigue se ejecutó en ese entorno. Ninguna prueba usa un iPhone real
ni sensores físicos; ver `limitations.md`.

## 2. Resumen

| Suite | Comando | Resultado |
|---|---|---|
| Estructura y app única | `node tools/check-xcode.js` | **135 / 135** |
| Juego y HUD (PWA) | `node tools/test-web.js` | **30 / 30** + horizontal OK |
| Escena, modos y Head Tracking | `node tools/test-v20.js` | **18 / 18** |
| VR SBS / IPD / panel | `node tools/test-vr.js` | **34 / 34** |
| Mando Bluetooth (simulado) | `node tools/test-pad.js` | **21 / 21** |
| Calibrador Windows | `cd windows-calibrator && npm test` | **62 / 62** |
| Verificador de `.ipa` | `node tools/verify-ipa.js <ipa> --variant v20` | **OK (18 comprobaciones)** |

## 3. `check-xcode.js` — 135/135

Comprueba sin Xcode:

- un solo `PBXNativeTarget` (`RasmaticVR`) y un solo esquema;
- `PRODUCT_BUNDLE_IDENTIFIER = com.rasmatic.lugar3d`;
- `CFBundleDisplayName = RASMATIC VR` y `CFBundleShortVersionString = 20.0`;
- `NSMotionUsageDescription` y ausencia de cámara;
- `HeadTrackingBridge.swift` con `CMMotionManager`, `startDeviceMotionUpdates`,
  yaw/pitch/roll, 1/60 s, `isDeviceMotionAvailable`;
- iconos exactos sin canal alfa;
- `web/index.html` carga `v20/pharmacy-scene.js`, `v20/pharmacy-core.js`,
  `headtracking/head-tracking.js`, VR y enlace Windows;
- manifest, `sw.js` y precache completo;
- espejo `ios/RasmaticLugar3D/www` idéntico byte a byte a `web/`;
- workflow único, `build-ipa.sh`, `verify-ipa.js` y las nueve piezas de
  documentación.

## 4. `test-v20.js` — 18/18

| Caso | Qué verifica |
|---|---|
| V20-01 | identidad única `RASMATIC VR`, prefijo `rasmatic.`, `headTracking: true` |
| V20-02 | sin referencias a las dos apps V19 |
| V20-03 | 15 medicamentos, 3 estanterías, 6 estaciones, 30 cajas de máquina, 330 cajas de estante, mostrador y ojo a 3,6 |
| V20-04 | seis estaciones separadas ≥ 2,6 unidades, cada una con su medicamento real y visible |
| V20-05 | 521 draw calls, 79.300 triángulos, 46 texturas (frente a 1.734 del HTML) |
| V20-06 | colisiones de sala, máquina, mostrador y cinta |
| V20-07 | modos `film`, `model`, `place` y rechazo de modo inválido |
| V20-08 | Fácil 12 s / 0,75×; Normal 9 s / 1,0×; Difícil 6 s / 1,25×; persistencia |
| V20-09 | cliente, recogida y entrega con puntaje |
| V20-10 | fin de partida, panel de resultado y vuelta a `idle` |
| V20-11 | joystick apagado oculta el control pero la entrada externa sigue moviendo |
| V20-12 | sensibilidad X/Y/roll, suavizado, respuesta e inversión; guardado en `rasmatic.ht.*` |
| V20-13 | el Head Tracking no mueve al personaje ni cambia `PP.yaw` |
| V20-14 | apagado/encendido del Head Tracking |
| V20-15 | `RasmaticVR.applyCal` desde Windows aplica los diez valores en caliente |
| V20-16 | datos inválidos o incompletos no sobrescriben nada |
| V20-17 | la configuración sobrevive a cerrar/abrir VR |
| V20-18 | control local de emergencia (encender/apagar desde el iPhone) |

## 5. `test-web.js` — 30/30

Cubre arranque, HUD 3:00, aviso JUGAR, inicio, cliente, recogida, entrega
correcta, entrega incorrecta, no duplicar puntos, ciclo del bot/CNC, fin de
partida, revancha, joystick táctil, arrastre de cámara, pausa, mando Gamepad,
pantalla completa, metadatos iOS, service worker, dificultad por API y panel,
posicionamiento del HUD, persistencia versionada, perfiles normal/VR y
aplicación en vivo sin romper la partida.

También comprueba en horizontal:

- canvas a pantalla completa sin scroll;
- JUGAR centrado, dentro del área segura y sin tapar el joystick;
- marcador y reloj sin solapes.

Evidencias generadas:

- `docs/evidencias/ios-01-inicio.png`
- `docs/evidencias/ui-02-personalizacion.png`
- `docs/evidencias/ui-03-personalizacion-vr.png`
- `docs/evidencias/ui-01-jugar.png`
- `docs/evidencias/ios-02-partida.png`
- `docs/evidencias/ios-03-final.png`
- `docs/evidencias/ios-04-horizontal.png`

## 6. `test-vr.js` — 34/34

Antes de V20 la suite usaba coordenadas del almacén. Se actualizaron a la
farmacia y se añadió la pestaña HEAD TRACKING (8 pestañas). Resultados:

- dos cámaras separadas por IPD, frustums asimétricos opuestos;
- parallax real (17,08 % de píxeles distintos entre ojos);
- IPD 50 → 75 mm cambia la separación y la imagen (11,14 % de píxeles);
- convergencia, perfiles de pantalla, zoom, gap, HUD por ojo y plano;
- distorsión de lente, brillo, saturación y modo prueba;
- cámara (altura, distancia, inclinación, zoom), intensidad 3D, lentes
  independientes, desplazamiento y recorte;
- guardar/cargar/exportar/importar perfiles, persistencia y restaurar grupos;
- panel completo con los controles de Head Tracking;
- WASD + Shift, Espacio para JUGAR, Escape para salir de VR;
- restauración de cámara/proyección/renderer y partida normal después de VR;
- pantalla completa y rendimiento medido en WebGL por software.

Evidencias: `docs/evidencias/vr-01-normal.png` … `vr-07-test-mode.png`.

## 7. `test-pad.js` — 21/21

Mando nativo inyectado (`RasmaticNativeGamepad`), conexión/desconexión,
joystick táctil, botones A/B/X/Y, sticks, gatillos, no duplicar con Gamepad
API, HUD VR por ojo y salida segura. También comprueba que el juego sigue en
`playing` después de salir de VR y que el menú de pausa no muestra “Salir”.

Evidencias: `pad-01-mando-nativo.png`, `pad-02-vr-iphone.png`,
`pad-03-girar-iphone.png`.

## 8. Calibrador Windows — 62/62

`npm test` en `windows-calibrator`:

- la spec se extrae del juego real y ahora incluye 8 pestañas y el grupo `ht`;
- defaults válidos;
- `/api/spec` no filtra secretos;
- validación de rangos y rechazo de valores inválidos;
- calibración iPhone → PC y PC → iPhone con origen y `rev`;
- bloqueo de calibración, modo Expo y revocación;
- replay de `seq`, mensajes malformados y gigantes;
- telemetría válida/inválida;
- reconexión del mismo equipo.

## 9. Verificación de `.ipa`

Se generó un `.ipa` **sintético** (Info.plist real, Mach-O de prueba y el
`www/` completo) para ejercitar el verificador:

```
node tools/verify-ipa.js %TEMP%\RASMATIC-VR-unsigned.ipa \
  --expect com.rasmatic.lugar3d --variant v20
```

Resultado: **OK**, 18 comprobaciones (un único `.app`, bundle, nombre, versión,
sensores, sin cámara, Mach-O, 15 archivos clave, sin `web-classic`, identidad
v20, escena de farmacia y recursos del `index.html`).

Esto valida el verificador y la estructura del contenido, **no** una
compilación real de Xcode.

## 10. Rendimiento observado

| Métrica | HTML original | V20 en la app |
|---|---|---|
| Draw calls (menú/escena) | 1.734 | 521 |
| Triángulos | 78.784 | 79.300 |
| Texturas | 47 | 46 |
| Mallas | 728 | 671 |
| Luces | 13 | 13 |

La reducción se logró fusionando las cajas decorativas de las estanterías por
material, sin tocar las seis cajas interactivas. No se usan sombras
dinámicas, igual que el HTML. La medición es con SwiftShader: no representa
FPS de un iPhone.

## 11. Pruebas pendientes (no ejecutadas)

- compilación real con `xcodebuild` y firma;
- instalación en iPhone;
- sensores de Core Motion reales (giroscopio/acelerómetro);
- mando Bluetooth físico;
- VR Box y separación interpupilar real;
- enlace Wi-Fi entre una PC y un iPhone físicos;
- FPS y consumo en GPU de iPhone.

No se afirma que estos puntos funcionen físicamente: solo están implementados y
cubiertos por simulación/emulación.
