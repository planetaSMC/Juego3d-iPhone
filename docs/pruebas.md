# Historial V19

> **Nota V20:** este documento describe la fase V19 (dos apps). En V20 hay una
> sola app (com.rasmatic.lugar3d) con el escenario de farmacia. Ver
> docs/v20/testing-report.md y docs/v20/README.md. La suite 	est-v19.js`n> ya no existe; los resultados de V19 quedan como referencia histórica.

# Pruebas

Fecha: 25 de noviembre de 2026.
Entorno: Windows 11, Node 24, Microsoft Edge 156 (Chromium) en modo headless.

Las pruebas estÃ¡n separadas por **dÃ³nde se ejecutan**, para no declarar como
probado algo que solo se simulÃ³:

| Entorno | QuÃ© se prueba | Estado |
|---|---|---|
| **Windows** | GeneraciÃ³n del paquete, estructura Xcode, juego en Chromium, VR de escritorio, mando/VR mÃ³vil simulado, verificador de `.ipa` | Ejecutado |
| **Simulado** | iPhone 844Ã—390 con tÃ¡ctil, UA de iPhone y `__RASMATIC_NATIVE__` inyectado | Ejecutado |
| **macOS / Xcode** | `xcodebuild`, compilaciÃ³n real y `.ipa` | **Pendiente** (no hay macOS) |
| **iPhone fÃ­sico** | InstalaciÃ³n, Safari/WKWebView, mando Bluetooth real, VR Box, rendimiento | **Pendiente** (no hay iPhone) |

---

## 1. Juego completo en Chromium (viewport de iPhone)

```powershell
node tools/test-web.js
```

El script levanta `tools/serve.js`, abre el navegador, simula un iPhone
(390Ã—844, tÃ¡ctil, DPR 1), juega una partida completa, verifica los casos, prueba
la recarga **sin conexiÃ³n** y guarda capturas en `docs/evidencias/`.

### Resultado

```
30/30 casos superados.
Consola sin errores.
Prueba sin conexion:
  ok   la app carga sin conexion desde el service worker
  ok   horizontal a pantalla completa
  ok   JUGAR centrado y HUD sin solapes en horizontal
```

| # | Caso | QuÃ© comprueba | Resultado |
|---|---|---|---|
| T01 | Arranque en idle con puente iOS | `window.__ready`, estado `idle`, `RasmaticIOS`, clase `ras-android` (la necesitan los CSS) | ok |
| T02 | HUD completo | marcador, reloj en `3:00`, panel de pedido, botÃ³n `JUGAR` | ok |
| T03 | Aviso de interacciÃ³n | cerca del encargado aparece `JUGAR` y â€œInteractuar para jugarâ€ | ok |
| T04 | Inicia la partida | `interact()` devuelve `true` y el estado pasa a `playing` | ok |
| T05 | Cliente y pedido | aparece el cliente y un color pedido | ok |
| T06 | Recoger sin sumar | el aviso es `RECOGER`, se lleva el color y el marcador sigue en 0 | ok |
| T07 | Entrega correcta | aviso `ENTREGAR`, +1 al jugador, deja de llevar el color | ok |
| T08 | Nuevo cliente | tras entregar aparece otro pedido | ok |
| T09 | Entrega incorrecta | no suma y el stock del color devuelto sube 1 | ok |
| T10 | Sin puntos duplicados | un segundo `interact()` no suma | ok |
| T11 | El bot suma con el CNC | recorre las fases, la caja pasa por el CNC y el bot suma 1 | ok |
| T12 | Fin de partida | estado `over`, panel de resultado, sin cliente ni bot-cliente, marcador estable | ok |
| T13 | Revancha | vuelve a `playing` con 0â€“0 y sin panel | ok |
| T14 | Joystick tÃ¡ctil | eventos de puntero sobre `#ras-stick` mueven al personaje | ok |
| T15 | CÃ¡mara por arrastre | arrastrar sobre el canvas cambia el giro | ok |
| T16 | Pausa en segundo plano | `onAppPause()` congela y `onAppResume()` reanuda (mismo camino que iOS) | ok |
| T17 | Mando fÃ­sico (Gamepad API) | stick izquierdo mueve, L2 activa correr, se oculta el joystick tÃ¡ctil y A inicia la partida | ok |
| T18 | Pantalla completa | sin scroll horizontal ni vertical, canvas del tamaÃ±o de la ventana | ok |
| T19 | Metadatos iOS | `viewport-fit=cover`, `maximum-scale`, manifest, icono Apple, cero rutas `android/` | ok |
| T20 | Sin botÃ³n â€œSalirâ€ inÃºtil | el botÃ³n de salir del menÃº de pausa estÃ¡ oculto | ok |
| T21 | Service worker | registrado y activo bajo http | ok |
| T22 | Dificultad del bot (API) | `setDifficulty('facil')` aplica 12 s / 0,75Ã— y persiste en `localStorage` | ok |
| T23 | Panel de opciones | el botÃ³n âš™ abre el panel, hay 3 niveles, se marca el elegido y Â«LISTOÂ» lo cierra | ok |
| T24 | JUGAR centrado y cÃ³modo | centro â‰¤ 1,5 px del centro de la ventana, dentro del Ã¡rea segura, â‰¥ 120Ã—50 px y sin tapar el joystick | ok |
| T25 | Textos legibles sin desbordes | paneles dentro del Ã¡rea segura, marcador â‰¥ 28 px, reloj â‰¥ 26 px, pedido â‰¥ 20 px, sin recortes | ok |
| T26 | TamaÃ±o individual del HUD | escala del marcador â‰¥ 1,15Ã— y tipografÃ­a del puntaje â‰¥ 1,2Ã— por API | ok |
| T27 | PosiciÃ³n y lÃ­mites | desplazamiento +20/+15 px exacto y extremos âˆ’40/+40 px recortados dentro de la ventana | ok |
| T28 | Persistencia versionada | `rasmatic.ui.v1` con `v:1`, recarga desde `localStorage` y valores invÃ¡lidos normalizados | ok |
| T29 | Perfiles y restauraciÃ³n | normal 1,25 y VR 0,8 independientes; restablecer elemento y perfil no toca al otro | ok |
| T30 | AplicaciÃ³n en vivo y panel | partida/joystick/gamepad intactos; 5 botones, vista previa, CANCELAR descarta y APLICAR cierra | ok |
| â€” | Sin conexiÃ³n | con la red cortada, la pÃ¡gina recarga y el juego arranca desde la cachÃ© | ok |
| â€” | Horizontal | a 844Ã—390 el canvas ocupa la ventana, JUGAR queda centrado sin tapar el joystick y el HUD no se solapa | ok |

T17 usa un mando inyectado (`window.__rasFakePad`) porque no hay hardware
conectado; ejercita el mismo camino que un mando real en Safari:
`navigator.getGamepads` â†’ mapeo â†’ `RasmaticInput`.

T11 tarda hasta 40 s: espera un ciclo completo del CNC, igual que la suite
Android.

---

## 1b. Suite V19 de las dos apps

```powershell
node tools/test-v19.js
```

Prueba la app Head Tracking con un puente **Core Motion simulado**
(`raw/status/bind`, exactamente la superficie que usa `HeadTrackingBridge.swift`),
la app Classic sin sensores y el fallback web con `DeviceOrientationEvent`.

### Resultado

```
=== Head Tracking Â· Core Motion simulado ===
  16/16 casos superados.
=== Classic Â· sin head tracking ===
  14/14 casos superados.
=== Head Tracking Â· fallback web ===
  16/16 casos superados.

Persistencia independiente:
  ok   HT conserva on y Classic conserva off
       {"app":"headtracking","joystick":true,"htKey":"on","classicKey":"off"}
```

| Caso | QuÃ© comprueba | HT | Classic |
|---|---|---|---|
| V19-01 | Identidad `RasmaticApp` y prefijo de almacenamiento | ok | ok |
| V19-02 | OpciÃ³n **JOYSTICK** visible y accesible | ok | ok |
| V19-03 | Joystick activo recibe el toque | ok | ok |
| V19-04 | Joystick off oculta el stick, ignora entradas y las suelta | ok | ok |
| V19-05 | La elecciÃ³n se guarda en la clave de esa app | ok | ok |
| V19-06 | El mando Bluetooth sigue funcionando con joystick off | ok | ok |
| V19-07 | Joystick on restaura el comportamiento actual | ok | ok |
| V19-08 | V18, duraciÃ³n, 6 medicamentos, CNC y dificultad intactos | ok | ok |
| V19-09 | SBS con 2 ojos, HUD duplicado e IPD/convergencia/intensidad | ok | ok |
| V19-10 | API de head tracking presente / Classic sin API | ok | ok |
| V19-11 | Girar e inclinar mueve la orientaciÃ³n / Classic sin script | ok | ok |
| V19-12 | El offset llega al render SBS en los dos ojos / sin controles HT | ok | ok |
| V19-13 | Recentrar vuelve al frente / Classic ignora sensores | ok | ok |
| V19-14 | Sensibilidad ajustable / claves Classic aisladas | ok | ok |
| V19-15 | Suavizado ajustable y persistido | ok | â€” |
| V19-16 | Sin datos informa timeout y no simula movimiento | ok | â€” |

> Los datos de orientaciÃ³n son **simulados** para validar la lÃ³gica interna.
> No son evidencia de funcionamiento fÃ­sico de los sensores.

---

## 2. Modo VR en escritorio

```powershell
node tools/test-vr.js
```

Abre un navegador Chromium en ventana de escritorio (1280Ã—720, DPR 1, sin
emulaciÃ³n tÃ¡ctil), ejecuta los casos V01â€“V26 dentro de la pÃ¡gina, prueba el
mouse con eventos reales, la entrada directa `?vr=1` y guarda capturas.

### Resultado

```
34/34 casos superados.
  ok   mouse gira la camara (yaw 0.000 -> -0.800)
  ok   el modo VR arranca solo con ?vr=1
Consola sin errores.
```

El script espera a que el juego termine `boot()` (`window.RasmaticArena`) y
corta con error si Chrome cierra la conexiÃ³n CDP, en vez de quedar colgado.
Cada caso se imprime (`[vr] ok/FAIL`) a medida que corre, asÃ­ un cuelgue se
puede ubicar en el caso exacto.

Cubre: activar/desactivar, dos vistas con parallax real (43,5 % de pÃ­xeles
distintos), separaciÃ³n ocular de 64 mm, frustums off-axis opuestos, IPD 50â€“75
mm, convergencia, perfiles de pantalla, tamaÃ±o y separaciÃ³n central, HUD por ojo
y HUD plano, distorsiÃ³n por render target, WASD + Shift + Espacio + Escape,
restauraciÃ³n de cÃ¡mara/renderer al salir y que el juego normal siga funcionando
despuÃ©s (recoger + entregar +1).

V08c exige ahora que el HUD ocupe **el rectÃ¡ngulo completo de cada ojo (1:1)**,
con sus paneles dentro del Ã¡rea segura y fuentes mÃ­nimas; V08e exige que
**JUGAR/RECOGER/ENTREGAR se espeje y quede centrado en cada ojo**. Antes las
copias se escalaban a la mitad y JUGAR solo existÃ­a en un borde: era el defecto
visible en `docs/evidencias/vr-02-vr-box.png`. Detalle de la UI en
`docs/ui-gameplay.md`.

V26 comprueba la personalizaciÃ³n de interfaz en VR: el perfil VR escala y
desplaza el HUD de forma idÃ©ntica en ambos ojos (tamaÃ±o y posiciÃ³n relativa al
ojo), el perfil normal no altera la vista VR y la operaciÃ³n no modifica IPD ni
convergencia. El panel de personalizaciÃ³n se abre desde Opciones y nunca sale
del Ã¡rea segura de cada ojo.

La calibraciÃ³n nueva (V15â€“V25) comprueba ademÃ¡s: logo RASMATIC oculto en la
partida, altura/distancia/inclinaciÃ³n/zoom de cÃ¡mara, intensidad 3D, escala y
desplazamiento independientes por ojo, desplazamiento del conjunto, aspecto
forzado, recorte por ojo, brillo real con vuelta al paso directo, modo prueba
con HUD oculto, guardar/cargar/exportar/importar/borrar perfiles, persistencia
en `localStorage`, restaurar por categorÃ­a y los 7 controles del panel
conectados. Detalle en `docs/vr-box-preview.md`.

---

## 3. Mando nativo y VR mÃ³vil (iPhone simulado)

```powershell
node tools/test-pad.js
```

Abre Chromium con ventana de iPhone horizontal (844Ã—390), DPR 1 y emulaciÃ³n
tÃ¡ctil. **Inyecta `__RASMATIC_NATIVE__` antes de cargar la pÃ¡gina**, exactamente
como `GameViewController.swift` con `WKUserScript`, asÃ­ que ejercita el puente
que usa la app (`RasmaticNativeGamepad`), no la Gamepad API de Safari.

### Resultado

```
21/21 casos superados.
```

| # | Caso | QuÃ© comprueba | Resultado |
|---|---|---|---|
| P01 | Puente GameController activo | `__RASMATIC_NATIVE__`, `RasmaticIOS.native`, Gamepad API apagada (`polling: false`) | ok |
| P02 | Aviso de conexiÃ³n | â€œMando conectado: DualSense Wirelessâ€ y clase `ras-pad-on` | ok |
| P03 | Y y Select | llegan al juego como `home` y `dock` | ok |
| P05 | A/R1/R2 | interactÃºan e inician la partida | ok |
| P06 | Stick izquierdo | mueve al personaje (2,6 m en 0,8 s) | ok |
| P07 | Stick derecho | gira la cÃ¡mara (yaw 0 â†’ âˆ’0,44) | ok |
| P08 | L1/L2 | corre 2,4Ã— respecto de caminar | ok |
| P09 | B/Start | actÃºa como â€œAtrÃ¡sâ€ en la partida (aviso â€œTocÃ¡ atrÃ¡s otra vez para salirâ€) | ok |
| P10 | X | abre y cierra el panel VR | ok |
| P11 | Sin doble entrada | los frames analÃ³gicos no disparan acciones; un botÃ³n dispara una sola vez | ok |
| P12 | DesconexiÃ³n | vuelve el joystick tÃ¡ctil y se limpia el estado | ok |
| P13 | ReconexiÃ³n | se ocultan los controles y vuelve el aviso con el nombre nuevo | ok |
| P14 | Gamepad API | no arranca con el puente nativo (no duplica) | ok |
| M01 | VR en el telÃ©fono | botÃ³n visible y `isMobile()` verdadero | ok |
| M02 | Activar VR | modo activo, horizontal, sin aviso, salida dentro del ojo izquierdo | ok |
| M03 | HUD por ojo | copias completas en cada ojo, original con `opacity: 0` | ok |
| M04 | VR con mando | se ocultan joystick, correr y pausa | ok |
| M05 | DesconexiÃ³n en VR | vuelve el joystick tÃ¡ctil | ok |
| M06 | Salida segura | el panel cierra el modo y restaura el HUD | ok |
| M07 | No regresiÃ³n | el juego sigue en `playing` y el joystick funciona | ok |
| M08 | X fuera de VR | abre y cierra el panel de ajustes | ok |

AdemÃ¡s, `tools/test-pad.js` comprueba fuera de la suite:

- el **aviso de orientaciÃ³n** en vertical (390Ã—844), con â€œContinuar asÃ­â€;
- el **menÃº de pausa** en iOS: visible con la regla `html.ras-ios`, con entrada
  **VR BOX** y sin botÃ³n **Salir**;
- el arranque directo con **`?vr=1`**;
- que la consola no tenga errores.

---

## 4. VerificaciÃ³n del paquete iOS (sin Mac)

```powershell
node tools/check-xcode.js
node tools/check-parity.js
```

### Resultado

```
OK: 246 comprobaciones superadas.          (check-xcode)
OK: 44 comprobaciones de paridad superadas. (check-parity)
```

`check-xcode.js` cubre:

- `project.pbxproj`: llaves balanceadas, IDs existentes, `rootObject` vÃ¡lido,
  tipo aplicaciÃ³n, `www` como folder reference, WebKit enlazado, target iOS 15,
  iPhone + iPad, `GamepadBridge.swift` y `HeadTrackingBridge.swift` en las
  fases correctas.
- **Tres targets**: Head Tracking, Classic y el heredado `RasmaticLugar3D`.
- Bundle IDs distintos (`...headtracking` y `...classic`) en Debug y Release.
- Esquemas compartidos apuntando a sus targets.
- `Info.plist` por app: nombre, variante, `RASMATICHeadTracking`,
  `NSMotionUsageDescription` solo en Head Tracking, sin cÃ¡mara, barra de estado
  oculta, `GCSupportsControllerUserInteraction`, pantalla de arranque y las
  cuatro orientaciones.
- `Assets.xcassets`: los 18 iconos de **cada** app existen, miden lo declarado
  y no tienen canal alfa.
- Swift: `@main`, `WKURLSchemeHandler`, URL `rasmatic://app/index.html`, sin
  `file://`, MIME de `woff2`, acceso limitado a `www/`, llaves balanceadas.
- Head Tracking: `import CoreMotion`, `CMMotionManager`,
  `startDeviceMotionUpdates`, `attitude.yaw/pitch/roll`, 60 Hz, envÃ­o a
  `RasmaticNativeHeadTracking.raw/status`, detecciÃ³n de sensor ausente y cero
  uso de cÃ¡mara.
- Classic: NO compila `HeadTrackingBridge.swift`, NO declara
  `NSMotionUsageDescription` y su web no contiene `headtracking/`.
- Mando nativo compartido: GameController, 60 Hz, zona muerta 0,18, gatillo 0,5,
  `RasmaticNativeGamepad.raw/press/status`, botones A/B/X/Y/Menu/Options.
- `web/` y `web-classic/`: recursos del HTML, manifest e iconos propios,
  service worker con cachÃ© distinta, prefijos `rasmatic.` y
  `rasmatic.classic.`.
- Espejos `ios/RasmaticHeadTracking/www` e `ios/RasmaticClassic/www` idÃ©nticos
  byte a byte a su web.
- Flujo de compilaciÃ³n: `.github/workflows/ios-ipa.yml` en runner macOS,
  `tools/check-xcode.js`, `tools/check-parity.js`, `tools/build-ipa.sh` con
  `set -euo pipefail`, sin firma, en LF, `tools/verify-ipa.js` y artefacto
  `rasmatic-v19-ipas`.

`check-parity.js` compara el nÃºcleo archivo por archivo. Solo permite
diferencias en `index.html`, `manifest.webmanifest`, `sw.js`, `icons/*` y la
carpeta `headtracking/` de Head Tracking. Cualquier divergencia en `game.js`,
`android-bridge.js`, CSS, modos, `three.js`, VR, red o puente iOS falla.

### Verificador del `.ipa`

```powershell
node tools/verify-ipa.js dist/RASMATIC-HeadTracking-unsigned.ipa `
  --expect com.rasmatic.lugar3d.headtracking --variant headtracking

node tools/verify-ipa.js dist/RASMATIC-Classic-unsigned.ipa `
  --expect com.rasmatic.lugar3d.classic --variant classic
```

Se probÃ³ con **IPAs sintÃ©ticos** armados en `%TEMP%` (Info.plist real, `www/`
completo y un Mach-O mÃ­nimo), no con un `.ipa` compilado por Xcode. El
verificador comprueba ademÃ¡s que Head Tracking lleve `www/headtracking/` y
`NSMotionUsageDescription`, y que Classic no lleve ninguno de los dos.

No valida la firma de Apple. La compilaciÃ³n y firma reales siguen pendientes de
un runner macOS y una cuenta Apple.

---

## 5. Calibrador Windows e instalador

```powershell
cd windows-calibrator
cmd /c "npm test"      # 62/62
cmd /c "npm run dist"  # genera el instalador NSIS
```

El instalador se probÃ³ con el binario ya empaquetado, sin instalarlo:

```powershell
Start-Process "release\win-unpacked\RASMATIC VR Calibrator.exe" -ArgumentList "--smoke" -Wait
```

```
SMOKE_RESULT PASS 14
```

Comprueba: app cargada, spec con claves, juego cargado y vista central activa,
servidor en puerto, sliders reales, vistas de diagnÃ³stico, cÃ³digo de
emparejamiento, guardar/cargar/borrar perfil, bloqueo/desbloqueo y validaciÃ³n de
valores fuera de rango.

Resultado de esta fase: `62/62` pruebas y `14/14` comprobaciones del smoke.
Instalador: `windows-calibrator/release/RASMATIC VR Calibrator Setup 1.0.0.exe`
(82.691.850 B, build de juego `0417b73dd1d31bc4`). No se ejecutÃ³ el instalador
completo en una mÃ¡quina limpia.

---

## 6. Evidencias

Capturas reales del juego en Chromium con viewport de iPhone (390Ã—844):

| Archivo | QuÃ© muestra |
|---|---|
| `docs/evidencias/ios-01-inicio.png` | arranque en el vestÃ­bulo, HUD, joystick y aviso del encargado |
| `docs/evidencias/ios-02-partida.png` | partida en curso: reloj en 2:56, `PEDIDO VERDE`, estaciÃ³n y botÃ³n `RECOGER` |
| `docs/evidencias/ios-03-final.png` | panel de resultado con `VOLVER A JUGAR` |
| `docs/evidencias/ios-04-horizontal.png` | la misma escena en horizontal (844Ã—390), sin recortes ni scroll |
| `docs/evidencias/ui-01-jugar.png` | JUGAR centrado y legible, con el HUD en la columna izquierda |
| `docs/evidencias/ui-02-personalizacion.png` | panel **PERSONALIZACIÃ“N DE INTERFAZ** con vista previa normal |
| `docs/evidencias/ui-03-personalizacion-vr.png` | el mismo panel con la vista previa SBS (perfil VR) |

Modo VR de escritorio:

| Archivo | QuÃ© muestra |
|---|---|
| `docs/evidencias/vr-01-normal.png` | vista normal en el pasillo |
| `docs/evidencias/vr-02-vr-box.png` | estÃ©reo real, perfil Ventana |
| `docs/evidencias/vr-03-vr-iphone.png` | perfil iPhone 15 horizontal + guÃ­as |
| `docs/evidencias/vr-04-distortion.png` | distorsiÃ³n de lente al 20 % |
| `docs/evidencias/vr-05-portrait.png` | perfil iPhone 15 vertical |
| `docs/evidencias/vr-06-panel.png` | panel de calibraciÃ³n abierto (pestaÃ±a CÃ¡mara) |
| `docs/evidencias/vr-07-test-mode.png` | modo prueba: cuadrÃ­cula, centros de lente y simetrÃ­a |

Mando y VR en iPhone simulado:

| Archivo | QuÃ© muestra |
|---|---|
| `docs/evidencias/pad-01-mando-nativo.png` | aviso â€œMando conectado: DualSense Wirelessâ€ con joystick oculto |
| `docs/evidencias/pad-02-vr-iphone.png` | VR estÃ©reo con HUD completo en cada ojo |
| `docs/evidencias/pad-03-girar-iphone.png` | aviso â€œGirÃ¡ el iPhoneâ€ en vertical |

---

## 7. Lo que NO se pudo verificar acÃ¡

Este entorno es Windows: no hay macOS, Xcode ni iPhone. Por lo tanto **no** se
probÃ³:

| Punto | Por quÃ© | CÃ³mo verificarlo |
|---|---|---|
| CompilaciÃ³n y firma del proyecto Xcode | requiere macOS + Xcode | abrir `ios/RasmaticLugar3D.xcodeproj` en una Mac y compilar, o correr `.github/workflows/ios-ipa.yml` |
| Compilar el `.ipa` en la nube | requiere cuenta GitHub y runner macOS | subir el repo y lanzar el flujo (`docs/instalar-en-iphone.md`) |
| Instalar el `.ipa` (Sideloadly/AltStore/TestFlight) | requiere Apple ID, PC con iTunes y un iPhone | seguir los 11 pasos de `docs/instalar-en-iphone.md` |
| Que el `WKURLSchemeHandler` sirva bien las fuentes | requiere WKWebView real | ejecutar la app y comprobar que el HUD usa Orbitron/Exo 2 |
| Safari real (motor WebKit) | el navegador disponible es Chromium | abrir la URL LAN en Safari |
| Zonas seguras del notch/isla y barra de gestos | requieren hardware | abrir en un iPhone y comprobar que nada queda tapado |
| InstalaciÃ³n como PWA | requiere Safari iOS | â€œAÃ±adir a pantalla de inicioâ€ |
| **Mando Bluetooth real** | requiere iPhone + mando | emparejar y probar sticks, A/L2/B/X (`docs/mando-bluetooth.md`) |
| **`GameController` de iOS** | requiere iOS real | la app ya lo usa; confirmar el aviso al conectar |
| **VR Box fÃ­sicas** | requieren las gafas y un iPhone | calibrar FOV, IPD, convergencia, tamaÃ±o, margen central y distorsiÃ³n con las lentes puestas, usando el modo prueba |
| **Legibilidad Ã³ptica del HUD en VR** | requiere lentes y distancia real de visiÃ³n | jugar con el VR Box y confirmar que marcador, pedido y JUGAR se leen sin forzar la vista |
| **Instalador NSIS ejecutado** | requiere instalarlo en una mÃ¡quina limpia | ejecutar `RASMATIC VR Calibrator Setup 1.0.0.exe` y repetir el smoke |
| **Head Tracking fÃ­sico** | requiere iPhone con giroscopio y VR Box | instalar la app Head Tracking, activar HT, girar/inclinar la cabeza y recentrar con R; comprobar que no hay deriva ni saltos. La lÃ³gica se probÃ³ con datos simulados, no con sensores reales |
| **Permiso de movimiento de iOS** | requiere un iPhone real | aceptar y denegar `NSMotionUsageDescription`; confirmar los estados `HT ACTIVO`, `PERMISO DENEGADO` y `SIN RESPUESTA` |
| **InstalaciÃ³n simultÃ¡nea real** | requiere dispositivo | instalar los dos `.ipa` y confirmar que conviven, se actualizan y se borran por separado |
| Rendimiento real (fps, baterÃ­a) | hardware distinto | jugar una partida completa en el iPhone |
| Service worker en iPhone | solo se habilita en https | servir por https o usar la app nativa |

Ninguno de esos puntos se marca como superado: quedan pendientes de la prueba
en un dispositivo real.
