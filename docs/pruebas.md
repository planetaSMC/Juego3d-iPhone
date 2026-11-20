# Pruebas

Fecha: 12 de noviembre de 2026.
Entorno: Windows 11, Node 24, Microsoft Edge 156 (Chromium) en modo headless.

Las pruebas están separadas por **dónde se ejecutan**, para no declarar como
probado algo que solo se simuló:

| Entorno | Qué se prueba | Estado |
|---|---|---|
| **Windows** | Generación del paquete, estructura Xcode, juego en Chromium, VR de escritorio, mando/VR móvil simulado, verificador de `.ipa` | Ejecutado |
| **Simulado** | iPhone 844×390 con táctil, UA de iPhone y `__RASMATIC_NATIVE__` inyectado | Ejecutado |
| **macOS / Xcode** | `xcodebuild`, compilación real y `.ipa` | **Pendiente** (no hay macOS) |
| **iPhone físico** | Instalación, Safari/WKWebView, mando Bluetooth real, VR Box, rendimiento | **Pendiente** (no hay iPhone) |

---

## 1. Juego completo en Chromium (viewport de iPhone)

```powershell
node tools/test-web.js
```

El script levanta `tools/serve.js`, abre el navegador, simula un iPhone
(390×844, táctil, DPR 1), juega una partida completa, verifica los casos, prueba
la recarga **sin conexión** y guarda capturas en `docs/evidencias/`.

### Resultado

```
21/21 casos superados.
Consola sin errores.
Prueba sin conexion:
  ok   la app carga sin conexion desde el service worker
  ok   horizontal a pantalla completa
```

| # | Caso | Qué comprueba | Resultado |
|---|---|---|---|
| T01 | Arranque en idle con puente iOS | `window.__ready`, estado `idle`, `RasmaticIOS`, clase `ras-android` (la necesitan los CSS) | ok |
| T02 | HUD completo | marcador, reloj en `3:00`, panel de pedido, botón `JUGAR` | ok |
| T03 | Aviso de interacción | cerca del encargado aparece `JUGAR` y “Interactuar para jugar” | ok |
| T04 | Inicia la partida | `interact()` devuelve `true` y el estado pasa a `playing` | ok |
| T05 | Cliente y pedido | aparece el cliente y un color pedido | ok |
| T06 | Recoger sin sumar | el aviso es `RECOGER`, se lleva el color y el marcador sigue en 0 | ok |
| T07 | Entrega correcta | aviso `ENTREGAR`, +1 al jugador, deja de llevar el color | ok |
| T08 | Nuevo cliente | tras entregar aparece otro pedido | ok |
| T09 | Entrega incorrecta | no suma y el stock del color devuelto sube 1 | ok |
| T10 | Sin puntos duplicados | un segundo `interact()` no suma | ok |
| T11 | El bot suma con el CNC | recorre las fases, la caja pasa por el CNC y el bot suma 1 | ok |
| T12 | Fin de partida | estado `over`, panel de resultado, sin cliente ni bot-cliente, marcador estable | ok |
| T13 | Revancha | vuelve a `playing` con 0–0 y sin panel | ok |
| T14 | Joystick táctil | eventos de puntero sobre `#ras-stick` mueven al personaje | ok |
| T15 | Cámara por arrastre | arrastrar sobre el canvas cambia el giro | ok |
| T16 | Pausa en segundo plano | `onAppPause()` congela y `onAppResume()` reanuda (mismo camino que iOS) | ok |
| T17 | Mando físico (Gamepad API) | stick izquierdo mueve, L2 activa correr, se oculta el joystick táctil y A inicia la partida | ok |
| T18 | Pantalla completa | sin scroll horizontal ni vertical, canvas del tamaño de la ventana | ok |
| T19 | Metadatos iOS | `viewport-fit=cover`, `maximum-scale`, manifest, icono Apple, cero rutas `android/` | ok |
| T20 | Sin botón “Salir” inútil | el botón de salir del menú de pausa está oculto | ok |
| T21 | Service worker | registrado y activo bajo http | ok |
| — | Sin conexión | con la red cortada, la página recarga y el juego arranca desde la caché | ok |
| — | Horizontal | a 844×390 el canvas ocupa la ventana y no hay scroll en ningún eje | ok |

T17 usa un mando inyectado (`window.__rasFakePad`) porque no hay hardware
conectado; ejercita el mismo camino que un mando real en Safari:
`navigator.getGamepads` → mapeo → `RasmaticInput`.

T11 tarda hasta 40 s: espera un ciclo completo del CNC, igual que la suite
Android.

---

## 2. Modo VR en escritorio

```powershell
node tools/test-vr.js
```

Abre un navegador Chromium en ventana de escritorio (1280×720, DPR 1, sin
emulación táctil), ejecuta los casos V01–V25 dentro de la página, prueba el
mouse con eventos reales, la entrada directa `?vr=1` y guarda capturas.

### Resultado

```
32/32 casos superados.
  ok   mouse gira la camara (yaw 0.000 -> -0.800)
  ok   el modo VR arranca solo con ?vr=1
Consola sin errores.
```

Cubre: activar/desactivar, dos vistas con parallax real (43,5 % de píxeles
distintos), separación ocular de 64 mm, frustums off-axis opuestos, IPD 50–75
mm, convergencia, perfiles de pantalla, tamaño y separación central, HUD por ojo
y HUD plano, distorsión por render target, WASD + Shift + Espacio + Escape,
restauración de cámara/renderer al salir y que el juego normal siga funcionando
después (recoger + entregar +1).

La calibración nueva (V15–V25) comprueba además: logo RASMATIC oculto en la
partida, altura/distancia/inclinación/zoom de cámara, intensidad 3D, escala y
desplazamiento independientes por ojo, desplazamiento del conjunto, aspecto
forzado, recorte por ojo, brillo real con vuelta al paso directo, modo prueba
con HUD oculto, guardar/cargar/exportar/importar/borrar perfiles, persistencia
en `localStorage`, restaurar por categoría y los 7 controles del panel
conectados. Detalle en `docs/vr-box-preview.md`.

---

## 3. Mando nativo y VR móvil (iPhone simulado)

```powershell
node tools/test-pad.js
```

Abre Chromium con ventana de iPhone horizontal (844×390), DPR 1 y emulación
táctil. **Inyecta `__RASMATIC_NATIVE__` antes de cargar la página**, exactamente
como `GameViewController.swift` con `WKUserScript`, así que ejercita el puente
que usa la app (`RasmaticNativeGamepad`), no la Gamepad API de Safari.

### Resultado

```
21/21 casos superados.
```

| # | Caso | Qué comprueba | Resultado |
|---|---|---|---|
| P01 | Puente GameController activo | `__RASMATIC_NATIVE__`, `RasmaticIOS.native`, Gamepad API apagada (`polling: false`) | ok |
| P02 | Aviso de conexión | “Mando conectado: DualSense Wireless” y clase `ras-pad-on` | ok |
| P03 | Y y Select | llegan al juego como `home` y `dock` | ok |
| P05 | A/R1/R2 | interactúan e inician la partida | ok |
| P06 | Stick izquierdo | mueve al personaje (2,6 m en 0,8 s) | ok |
| P07 | Stick derecho | gira la cámara (yaw 0 → −0,44) | ok |
| P08 | L1/L2 | corre 2,4× respecto de caminar | ok |
| P09 | B/Start | actúa como “Atrás” en la partida (aviso “Tocá atrás otra vez para salir”) | ok |
| P10 | X | abre y cierra el panel VR | ok |
| P11 | Sin doble entrada | los frames analógicos no disparan acciones; un botón dispara una sola vez | ok |
| P12 | Desconexión | vuelve el joystick táctil y se limpia el estado | ok |
| P13 | Reconexión | se ocultan los controles y vuelve el aviso con el nombre nuevo | ok |
| P14 | Gamepad API | no arranca con el puente nativo (no duplica) | ok |
| M01 | VR en el teléfono | botón visible y `isMobile()` verdadero | ok |
| M02 | Activar VR | modo activo, horizontal, sin aviso, salida dentro del ojo izquierdo | ok |
| M03 | HUD por ojo | copias completas en cada ojo, original con `opacity: 0` | ok |
| M04 | VR con mando | se ocultan joystick, correr y pausa | ok |
| M05 | Desconexión en VR | vuelve el joystick táctil | ok |
| M06 | Salida segura | el panel cierra el modo y restaura el HUD | ok |
| M07 | No regresión | el juego sigue en `playing` y el joystick funciona | ok |
| M08 | X fuera de VR | abre y cierra el panel de ajustes | ok |

Además, `tools/test-pad.js` comprueba fuera de la suite:

- el **aviso de orientación** en vertical (390×844), con “Continuar así”;
- el **menú de pausa** en iOS: visible con la regla `html.ras-ios`, con entrada
  **VR BOX** y sin botón **Salir**;
- el arranque directo con **`?vr=1`**;
- que la consola no tenga errores.

---

## 4. Verificación del paquete iOS (sin Mac)

```powershell
node tools/check-xcode.js
```

### Resultado

```
OK: 118 comprobaciones superadas.
```

Cubre:

- `project.pbxproj`: llaves balanceadas, IDs existentes, `rootObject` válido,
  tipo aplicación, `www` como folder reference, WebKit enlazado, target iOS 15,
  iPhone + iPad, `GamepadBridge.swift` dado de alta en la fase Sources.
- Esquema compartido apuntando al target correcto.
- `Info.plist`: XML completo, claves obligatorias, barra de estado oculta,
  `GCSupportsControllerUserInteraction`, pantalla de arranque y las cuatro
  orientaciones.
- `Assets.xcassets`: los 18 iconos existen, miden lo declarado y **no tienen
  canal alfa** (la App Store rechaza el icono 1024 con alfa).
- Swift: `@main`, `WKURLSchemeHandler` registrado, URL de arranque
  `rasmatic://app/index.html` coherente con el handler, sin `file://`, MIME de
  `woff2`, acceso limitado a `www/`, llaves balanceadas.
- Mando nativo: `import GameController`, notificaciones de conexión y
  desconexión, timer de 60 Hz, zona muerta 0,18, gatillo 0,5, envío a
  `RasmaticNativeGamepad.raw/press/status`, nombre real (`vendorName`),
  L1/L2 para correr, cruceta sumada al stick y botones A/B/X/Y/Menu/Options.
- Marcador `__RASMATIC_NATIVE__` inyectado con `WKUserScript` en
  `.atDocumentStart`, antes de cargar la página.
- `web/`: recursos del HTML (incluidos `ios/ios.css`, `ios/ios-bridge.js`,
  `vr/vr-preview.css` y `vr/vr-preview.js`), manifest, iconos y todo el
  precache del service worker.
- Orden de scripts: puente iOS antes del módulo VR.
- Espejo `ios/RasmaticLugar3D/www`: mismos archivos, idénticos byte a byte.
- Flujo de compilación: `.github/workflows/ios-ipa.yml` en runner macOS,
  `tools/check-xcode.js`, `tools/build-ipa.sh` con `set -euo pipefail`, sin
  firma, en LF (macOS rechaza CRLF), `tools/verify-ipa.js` y artefacto
  descargable.
- `tools/publish-github.js` usa el mismo verificador.

### Verificador del `.ipa`

```powershell
node tools/verify-ipa.js dist/RasmaticLugar3D-unsigned.ipa
```

Se probó con un **IPA sintético** armado en `%TEMP%` (Info.plist real, `www/`
completo y un Mach-O mínimo), no con un `.ipa` compilado por Xcode:

```
  ok   ZIP con 32 entradas
  ok   un unico Payload/*.app: RasmaticLugar3D.app
  ok   bundle id esperado: com.rasmatic.lugar3d
  ok   ejecutable en la raiz de la .app
  ok   el ejecutable es Mach-O (64 bits)
  ok   juego completo dentro de www/ (9 archivos clave)
  ok   todos los recursos del index.html estan dentro (15)
OK: el .ipa tiene la estructura correcta y el juego completo adentro.
```

También se comprobó que **falla** cuando el `Info.plist` conserva
`$(PRODUCT_BUNDLE_IDENTIFIER)` o cuando falta el `Payload/*.app`, que es lo que
debe hacer. No valida la firma de Apple.

---

## 5. Evidencias

Capturas reales del juego en Chromium con viewport de iPhone (390×844):

| Archivo | Qué muestra |
|---|---|
| `docs/evidencias/ios-01-inicio.png` | arranque en el vestíbulo, HUD, joystick y aviso del encargado |
| `docs/evidencias/ios-02-partida.png` | partida en curso: reloj en 2:56, `PEDIDO VERDE`, estación y botón `RECOGER` |
| `docs/evidencias/ios-03-final.png` | panel de resultado con `VOLVER A JUGAR` |
| `docs/evidencias/ios-04-horizontal.png` | la misma escena en horizontal (844×390), sin recortes ni scroll |

Modo VR de escritorio:

| Archivo | Qué muestra |
|---|---|
| `docs/evidencias/vr-01-normal.png` | vista normal en el pasillo |
| `docs/evidencias/vr-02-vr-box.png` | estéreo real, perfil Ventana |
| `docs/evidencias/vr-03-vr-iphone.png` | perfil iPhone 15 horizontal + guías |
| `docs/evidencias/vr-04-distortion.png` | distorsión de lente al 20 % |
| `docs/evidencias/vr-05-portrait.png` | perfil iPhone 15 vertical |
| `docs/evidencias/vr-06-panel.png` | panel de calibración abierto (pestaña Cámara) |
| `docs/evidencias/vr-07-test-mode.png` | modo prueba: cuadrícula, centros de lente y simetría |

Mando y VR en iPhone simulado:

| Archivo | Qué muestra |
|---|---|
| `docs/evidencias/pad-01-mando-nativo.png` | aviso “Mando conectado: DualSense Wireless” con joystick oculto |
| `docs/evidencias/pad-02-vr-iphone.png` | VR estéreo con HUD completo en cada ojo |
| `docs/evidencias/pad-03-girar-iphone.png` | aviso “Girá el iPhone” en vertical |

---

## 6. Lo que NO se pudo verificar acá

Este entorno es Windows: no hay macOS, Xcode ni iPhone. Por lo tanto **no** se
probó:

| Punto | Por qué | Cómo verificarlo |
|---|---|---|
| Compilación y firma del proyecto Xcode | requiere macOS + Xcode | abrir `ios/RasmaticLugar3D.xcodeproj` en una Mac y compilar, o correr `.github/workflows/ios-ipa.yml` |
| Compilar el `.ipa` en la nube | requiere cuenta GitHub y runner macOS | subir el repo y lanzar el flujo (`docs/instalar-en-iphone.md`) |
| Instalar el `.ipa` (Sideloadly/AltStore/TestFlight) | requiere Apple ID, PC con iTunes y un iPhone | seguir los 11 pasos de `docs/instalar-en-iphone.md` |
| Que el `WKURLSchemeHandler` sirva bien las fuentes | requiere WKWebView real | ejecutar la app y comprobar que el HUD usa Orbitron/Exo 2 |
| Safari real (motor WebKit) | el navegador disponible es Chromium | abrir la URL LAN en Safari |
| Zonas seguras del notch/isla y barra de gestos | requieren hardware | abrir en un iPhone y comprobar que nada queda tapado |
| Instalación como PWA | requiere Safari iOS | “Añadir a pantalla de inicio” |
| **Mando Bluetooth real** | requiere iPhone + mando | emparejar y probar sticks, A/L2/B/X (`docs/mando-bluetooth.md`) |
| **`GameController` de iOS** | requiere iOS real | la app ya lo usa; confirmar el aviso al conectar |
| **VR Box físicas** | requieren las gafas y un iPhone | calibrar FOV, IPD, convergencia, tamaño, margen central y distorsión con las lentes puestas, usando el modo prueba |
| Seguimiento de cabeza | fuera de alcance (no hay AR/WebXR) | — |
| Rendimiento real (fps, batería) | hardware distinto | jugar una partida completa en el iPhone |
| Service worker en iPhone | solo se habilita en https | servir por https o usar la app nativa |

Ninguno de esos puntos se marca como superado: quedan pendientes de la prueba
en un dispositivo real.
