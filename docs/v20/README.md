# V20 · RASMATIC VR unificado

> **V21 continúa esta fase.** El gameplay, la mira, la cinta funcional, la fila
> de clientes y el menú de inicio se documentan en `docs/v21/README.md`.
> V20.1 conserva la app única y el escenario de farmacia; V21 los reutiliza.

V20 unifica las dos apps V19 en una sola app iOS:

- **Nombre visible:** RASMATIC VR
- **Bundle ID:** `com.rasmatic.lugar3d`
- **Head Tracking:** Core Motion integrado + panel local + configuración desde Windows.
- **Escena:** farmacia 3D extraída del HTML de referencia mediante REA.
- **Modos:** recorrido guiado, exploración/modelo y partida RASMATIC.
- **Controles:** joystick táctil opcional, mando Bluetooth, Head Tracking.
- **VR:** SBS, IPD, convergencia, distorsión e intensidad 3D existentes.
- **Configuración:** Windows → iPhone por el enlace local existente, con `rev`,
  `ack`, persistencia y reconexión.

## Documentos

| Archivo | Contenido |
|---|---|
| `rea-architecture.md` | arquitectura, motor, escena, luces, colisiones, runtime |
| `rea-mechanics.md` | movimiento, interacción, pedidos, cinta, máquina, puntaje |
| `rea-assets.md` | medicamentos, texturas, geometrías, conteo y optimización |
| `rea-game-modes.md` | modos del HTML vs modos RASMATIC y mapeo V20 |
| `rea-integration-plan.md` | contrato escena/juego, fases, riesgos, aceptación |
| `windows-headtracking-config.md` | controles y sincronización Windows-iPhone |
| `testing-report.md` | pruebas ejecutadas y resultados |
| `limitations.md` | lo que no se pudo validar físicamente |

## Evidencia REA

- HTML SHA-256: `773B921A01751118C732932FEBEF1C27C7DA070B9E4C640E98D0C1524D86D57E`.
- Script inline SHA-256: `19913B6258F5918913B9BA96FE38F8CF54568EA532C1292BAFB5BC4BA8BE1795`.
- Análisis estático REA: `ev_0f2bf10ad93e66a6d120304271dcd5b373b2b39ff4229e7ff55b464b4b9e281a`.
- Padre REA: `ev_e772a1d869e1dba8976e15a9b86cdc311a9f1d36c2298dedea2145c36b46467b`.
- Runtime: Three.js r128, 728 mallas, 317 geometrías, 47 texturas, 13 luces,
  1.734 draw calls, 78.784 triángulos (menú).
- Captura del HTML: `docs/evidencias/v20/rea-html-runtime.png`.
- Captura de la escena V20: `docs/evidencias/v20/scene-v20.png`.

## Estructura de la app

```
web/
├── index.html                 shell V20 (HUD V18/V19 + scripts)
├── v20/pharmacy-scene.js      escena de farmacia extraída del HTML
├── v20/pharmacy-core.js       renderer, cámara, tres modos, contrato del juego
├── v20/pharmacy.css           estilos del shell y del dock de rutas
├── mobile/game.js             mecánicas RASMATIC sobre la farmacia
├── mobile/android-bridge.js   joystick, mando, pausa
├── headtracking/head-tracking.js  Core Motion + config X/Y/roll
├── vr/vr-preview.js           SBS, IPD, panel HEAD TRACKING
└── net/vr-link.js             enlace Windows (cal/rev/ack)
```

La app iOS vive en `ios/RasmaticLugar3D` y se espeja a
`ios/RasmaticLugar3D/www` con `node tools/build-ios.js`. Hay **un solo**
target `RasmaticVR`, un esquema `RasmaticVR` y el bundle
`com.rasmatic.lugar3d`.

## Cómo reconstruir y verificar

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
node tools/test-v20.js
node tools/test-web.js
node tools/test-vr.js
node tools/test-pad.js
cd windows-calibrator; npm test
```

En macOS:

```bash
chmod +x tools/build-ipa.sh
./tools/build-ipa.sh
node tools/verify-ipa.js dist/RASMATIC-VR-unsigned.ipa \
  --expect com.rasmatic.lugar3d --variant v20
```

## Estado

- Rama V20 original: `v20`.
- Corrección de compilación: rama `fix/v20.1-core-motion` y PR #2.
- Punto de recuperación V19: rama `v19-recovery` (commit `53f410b`).
- `main` conserva V20 fusionado; V20.1 está en PR y no se fusiona
  automáticamente.
- Resultados de simulación: **139/139** estructura, **30/30** juego,
  **18/18** V20, **34/34** VR, **21/21** mando y **62/62** calibrador Windows.
- Compilación real: **BUILD SUCCEEDED** en Xcode 16.4 / iPhoneOS 18.5
  (runs 45809544456 y 45809851662). IPA sin firmar de 829.907 bytes; el
  SHA-256 varía por marcas de tiempo entre builds (`7778E6B4…01273` y
  `8FE2D696…FD55E`).
- Pendiente: firma, instalación en iPhone, Core Motion, Bluetooth y VR Box
  físicos. Ver `limitations.md` y `v20.1-core-motion-fix.md`.
