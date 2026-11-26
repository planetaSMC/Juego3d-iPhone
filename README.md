# RASMATIC VR · versión iPhone (V21)

Port del juego **RASMATIC Lugar 3D** a **una sola app iOS**:

| Dato | Valor |
|---|---|
| Nombre visible | **RASMATIC VR** |
| Bundle ID | `com.rasmatic.lugar3d` |
| Target / esquema | `RasmaticVR` |
| Artefacto | `dist/RASMATIC-VR-unsigned.ipa` |
| Rama de desarrollo | `v21-gameplay-animation` |
| Base | V20.1 (`fix/v20.1-core-motion`, `b008e34`) |
| Punto de recuperación V19 | rama `v19-recovery` (commit `53f410b`) |

La app incluye:

- **Head Tracking** con Core Motion (`CMMotionManager` / `CMDeviceMotion`),
  sin cámara ni ARKit.
- **Configuración de Head Tracking desde Windows**: activar/desactivar,
  sensibilidad horizontal, vertical y de inclinación, suavizado, velocidad de
  respuesta, calibración, recentrado e inversión de ejes.
- **Escenario de farmacia** extraído del HTML de referencia con REA:
  estanterías, cajas de medicamentos, cinta en L, mostrador, clientes,
  farmacéutico y máquina **RASMATIC BOT**.
- **Tres modos**: recorrido guiado, modelo/exploración y lugar/partida.
- **Tres dificultades** (Fácil, Normal, Difícil) con sus reglas, objetivos,
  puntuación, victoria/derrota y al bot con el CNC.
- **Joystick táctil opcional** y **mando Bluetooth** independiente.
- **VR SBS**: dos ojos, IPD, convergencia, distorsión, zoom y HUD por ojo.

V21 añade:

- **Mira central** con raycast, contorno en la caja apuntada y sin etiquetas
  flotantes sobre los medicamentos.
- **Pedido por imagen**: el HUD muestra la caja real del medicamento solicitado.
- **Entrega por cinta**: la caja viaja por la cinta en L, el empleado la recoge,
  se la entrega al cliente y recién ahí se valida el pedido.
- **Fila de tres clientes** con pedidos, espera, avance, recepción y salida.
- **Menú de inicio INICIAR** con cuenta regresiva **3, 2, 1** y reloj congelado.
- **Animaciones** de clientes, empleado, cajas y cinta.
- **FARMACIA RASMATIC** en el cartel; cajas de colores; personajes a escala
  humana; cinta de la máquina eliminada.

V20 **reemplaza por completo** el mapa anterior (góndolas, productos y logo del
almacén). No quedan elementos ocultos ni superpuestos.

---

## 1. Instalar en un iPhone

No se puede instalar una app propia sin firmarla con una cuenta Apple y sin
compilarla en macOS. La guía paso a paso está en
**`docs/instalar-en-iphone.md`**.

Resumen:

1. Subir el proyecto a GitHub.
2. **Actions → iOS app V21 (RASMATIC VR) → Run workflow**.
3. Descargar el artefacto `rasmatic-v21-ipa` y descomprimirlo.
4. Instalar `RASMATIC-VR-unsigned.ipa` con Sideloadly o AltStore.

También se puede compilar en una Mac:

```bash
chmod +x tools/build-ipa.sh
./tools/build-ipa.sh
node tools/verify-ipa.js dist/RASMATIC-VR-unsigned.ipa \
  --expect com.rasmatic.lugar3d --variant v20
```

> La compilación real de V21 se hizo en GitHub Actions con Xcode 16.4:
> **BUILD SUCCEEDED** (run 45884702769). IPA sin firmar de 840.012 bytes,
> SHA-256 `30B2576843B143A23C235512A0C82862C2A59CF29139DBF392BF538373EF2956`.
> El hash puede variar por marcas de tiempo entre compilaciones; el contenido
> y el tamaño son los mismos. La firma e instalación en iPhone siguen
> pendientes. Ver `docs/v21/testing-report.md` y `docs/v21/limitations.md`.

### Calibrador de Windows

El workflow **Windows VR Calibrator (V21)** compila el instalador NSIS en
`windows-latest`, ejecuta las 62 pruebas y publica el artefacto
**`rasmatic-windows-calibrator`**:

1. Actions → **Windows VR Calibrator (V21)** → Run workflow.
2. Descargar el artefacto `rasmatic-windows-calibrator`.
3. Ejecutar `RASMATIC VR Calibrator Setup 1.0.0.exe`.

Build verificado: run 45884702784, instalador de 82.022.901 B, SHA-256
`053C84A4C908C4AA26F805DAC2DC7BD0D8C850DBA12BA88C4E3619A28049946F`.
Detalle: `docs/WINDOWS_VR_CALIBRATOR.md`.

---

## 2. Probar la PWA mientras tanto

```powershell
node tools/serve.js --port 8080
```

Abrir `http://127.0.0.1:8080/index.html`. La PWA usa el mismo `web/` que la app
nativa. Para el enlace con Windows, abrir también
`windows-calibrator` (`npm install && npm start`).

---

## 3. Controles

| Acción | Teclado | Táctil | Mando |
|---|---|---|---|
| Mover | `WASD` / flechas | joystick (si está activo) | stick izquierdo |
| Mirar | arrastrar / flechas | arrastrar | stick derecho |
| Correr | `Shift` | botón correr | L1/L2 |
| Interactuar | `E` / `Espacio` | botón contextual | A / R1 / R2 |
| Atrás / pausa | `Esc` | botón pausa | B / Start |
| Menú VR | `V` | VR BOX | X |

El **joystick táctil** se puede apagar desde Opciones. Al apagarlo se oculta,
se ignoran sus entradas y se sueltan las que hayan quedado activas; el mando
Bluetooth, la cámara y la interacción siguen funcionando.

El **Head Tracking** solo cambia la orientación de la cámara durante el render:
no mueve al personaje, no toca `PP.yaw/PP.pitch`, no altera el estado del juego
y no interfiere con el mando.

---

## 4. Configuración desde Windows

Sección **HEAD TRACKING** del calibrador:

1. Head Tracking ACTIVADO / DESACTIVADO.
2. Sensibilidad horizontal.
3. Sensibilidad vertical.
4. Sensibilidad de inclinación lateral.
5. Suavizado.
6. Velocidad de respuesta.
7. Calibración inicial.
8. Recentrado.
9. Invertir eje horizontal.
10. Invertir eje vertical.

Incluye valores actuales, restaurar predeterminados y estado de conexión. Los
cambios se aplican sin reinstalar la app, con confirmación (`rev`/`ack`) y
persistencia en ambos lados. Si Windows se desconecta, el iPhone conserva la
última configuración y puede apagar/recentrar el Head Tracking desde el panel
VR local.

Detalle completo: **`docs/v20/windows-headtracking-config.md`**.

---

## 5. VR Box

En el iPhone:

1. Conectar el mando por Bluetooth (opcional).
2. Tocar **VR BOX** o la **X** del mando.
3. Girar a horizontal y poner el teléfono en la VR Box.
4. Ajustar IPD/convergencia desde el panel.
5. Salir con **Salir (Esc)** o **VR BOX** de nuevo.

En Windows:

```
http://127.0.0.1:8080/index.html?vr=1
```

La vista previa de Windows comparte la misma calibración VR y ahora también la
pestaña **HEAD TRACKING**.

Más detalle: **`docs/vr-box-preview.md`**.

---

## 6. Estructura

```
Juego3d-iPhone/
  .github/workflows/ios-ipa.yml   compila el .ipa en macOS (sin Mac propia)
  web/                            sitio PWA y contenido de la app
    index.html                    shell V20 + HUD V18/V19
    v20/pharmacy-scene.js         escena de farmacia extraída del HTML
    v20/pharmacy-core.js          renderer, cámara, tres modos, contrato
    v20/pharmacy.css              estilos del shell y rutas
    mobile/game.js                mecánicas RASMATIC sobre la farmacia
    mobile/android-bridge.js      joystick, mando, pausa
    mobile/modes.js               registro de experiencias
    headtracking/head-tracking.js Core Motion + configuración X/Y/roll
    vr/vr-preview.js              SBS, IPD, panel HEAD TRACKING
    net/vr-link.js                enlace Windows (cal/rev/ack)
    fonts/, icons/                fuentes e iconos locales
  ios/
    RasmaticLugar3D.xcodeproj     un solo target y esquema RasmaticVR
    RasmaticLugar3D/              Swift, Info.plist, Assets, www/
  windows-calibrator/             app Windows de configuración VR/HT
  tools/                          build, verificación, pruebas, .ipa
  docs/                            REA V20, pruebas, instalación, VR, mando
```

`web/` y `ios/RasmaticLugar3D/www` deben ser **idénticos byte a byte**.

---

## 7. Reconstruir y verificar

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
```

Hace:

1. `tools/make-icons.ps1` → iconos de PWA y de la app.
2. `tools/build-ios.js` → `manifest.webmanifest`, `sw.js` y espejo iOS.
3. `tools/check-xcode.js` → **162 comprobaciones** (target único, plist,
   permisos, iconos, escena V20, precache y espejo).

Para empaquetar el proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File tools/package.ps1
```

---

## 8. Pruebas

```powershell
node tools/test-v21.js     # menú, mira, cinta, fila, escenario V21, VR
node tools/test-v20.js     # escena, modos, dificultades, HT, puente Windows
node tools/test-web.js     # juego, HUD, joystick, mando, offline
node tools/test-vr.js      # SBS, IPD, convergencia, panel, rendimiento
node tools/test-pad.js     # mando nativo, botones, VR, salida segura
cd windows-calibrator; npm test
```

Resultados de la última ejecución (2026-11-26, Windows + Edge headless):

| Suite | Resultado |
|---|---|
| `check-xcode.js` | **162/162** |
| `test-v20.js` | **18/18** |
| `test-web.js` | **30/30** + horizontal |
| `test-vr.js` | **34/34** |
| `test-pad.js` | **21/21** |
| calibrador Windows | **62/62** |
| `verify-ipa.js` (IPA sintético) | **OK** |

Capturas en `docs/evidencias/` y `docs/evidencias/v20/`.

---

## 9. Documentación

| Archivo | Contenido |
|---|---|
| `docs/v20/README.md` | índice y estado V20 |
| `docs/v20/rea-architecture.md` | arquitectura del HTML |
| `docs/v20/rea-mechanics.md` | mecánicas del HTML |
| `docs/v20/rea-assets.md` | inventario y optimización |
| `docs/v20/rea-game-modes.md` | modos del HTML vs RASMATIC |
| `docs/v20/rea-integration-plan.md` | plan y criterios de aceptación |
| `docs/v20/windows-headtracking-config.md` | configuración Windows-iPhone |
| `docs/v20/testing-report.md` | pruebas y evidencias |
| `docs/v20/limitations.md` | límites de la validación V20 |
| `docs/v21/README.md` | resumen de gameplay y archivos V21 |
| `docs/v21/aim-and-queue.md` | mira, contorno, pedido y fila |
| `docs/v21/conveyor-delivery.md` | recorrido y validación de la cinta |
| `docs/v21/start-menu.md` | menú y cuenta regresiva |
| `docs/v21/testing-report.md` | pruebas V21 |
| `docs/v21/limitations.md` | límites de V21 |
| `docs/instalar-en-iphone.md` | instalación con Sideloadly/AltStore |
| `docs/vr-box-preview.md` | VR Box y calibración |
| `docs/mando-bluetooth.md` | mando Bluetooth |
| `docs/paridad.md` | diferencias con Android |

---

## 10. Estado y limitaciones

Implementado y probado en simulación:

- app única, target y bundle únicos;
- escena de farmacia del HTML sin restos del almacén;
- tres modos, tres dificultades, partida completa, bot/CNC;
- joystick opcional, mando simulado, Head Tracking configurable;
- SBS/IPD/convergencia y panel VR;
- sincronización Windows-iPhone por protocolo con persistencia y `ack`;
- V21: menú/cuenta, mira con contorno, pedido por imagen, cinta funcional,
  fila de clientes y animaciones.

**Compilación iOS:** V21 compiló en GitHub Actions con Xcode 16.4
(`BUILD SUCCEEDED`, runs 45880086744 y 45880239776). IPA sin firmar de 840.012
bytes; el SHA-256 varía por marcas de tiempo (observados `4287E5FE…` y
`66714AB0…`), verificado con `verify-ipa.js`.

**Pendiente de validación física** (no se afirma que funcione en hardware):

- firmar el IPA e instalar en un iPhone;
- Core Motion real, mando Bluetooth real, VR Box real;
- Wi-Fi entre PC e iPhone reales;
- FPS y consumo en la GPU del iPhone.

Antes de publicar V21 como terminada hay que completar esos puntos. Ver
**`docs/v21/limitations.md`** y **`docs/v20/limitations.md`**.

`main` no se modifica hasta que la validación física esté aprobada.
