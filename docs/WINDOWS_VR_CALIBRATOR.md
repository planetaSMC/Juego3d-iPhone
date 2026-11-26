# RASMATIC · VR Calibrator para Windows

Aplicación de escritorio para Windows 10/11 que muestra **RASMATIC Lugar3D en una sola
perspectiva normal**, permite calibrar el VR Box en tiempo real y mantiene una única
configuración compartida con el iPhone por la red Wi-Fi local.

- Juego: `web/` (Three.js, mismo código que la app iPhone).
- Calibrador: `windows-calibrator/` (Electron).
- Enlace iPhone: `web/net/vr-link.js` + servidor WebSocket del calibrador.

---

## 1. Qué hace

| Función | Estado |
| --- | --- |
| Vista central grande, sin Side-by-Side | Implementado (`mono` + `center`) |
| Vistas de diagnóstico (central / ojo izq. / ojo der. / SBS) | Implementado |
| Pantalla completa y vista expandida | Implementado (F11 / Esc) |
| Calibración con los parámetros reales del juego | Implementado (spec extraída de `vr-preview.js`) |
| Sincronización bidireccional Windows ↔ iPhone | Implementado (WebSocket, `rev` + `origin`) |
| Emparejamiento con código temporal + token | Implementado |
| Modo Expo | Implementado |
| Bloqueo de calibración | Implementado |
| Perfiles | Implementado |
| Panel de seguridad | Implementado |
| Instalador `.exe` | Ver sección 9 |

La vista previa **no es un video del iPhone**: la PC ejecuta el mismo juego localmente
(misma escena, mismas cámaras, misma lógica) y recibe del iPhone la pose del jugador y
el estado de la partida por telemetría. Así el calibrador consume poco ancho de banda y
sigue funcionando aunque el enlace se corte.

---

## 2. Arquitectura

```
┌──────────────────────── PC (Electron) ────────────────────────┐
│  Proceso principal (autoritativo)                             │
│   · Store JSON en userData (calibración, perfiles, tokens)    │
│   · Servidor HTTP 127.0.0.1:8737 (app + juego)                │
│   · Servidor WebSocket 0.0.0.0:8737/vr (solo iPhone)          │
│   · Seguridad: pairing, tokens, PIN, rate limit               │
│         │ IPC estrecho (contextIsolation + sandbox)           │
│  Renderer (interfaz)                                          │
│   · iframe same-origin /game/index.html?embed=1               │
│   · RasmaticVR.enableMono('center') / applyCal / setLocked    │
└───────────────────────────────────────────────────────────────┘
              ▲ ws://IP-PC:8737/vr
              │ hello / pair / auth / cal / state / ping / ack
┌─────────────┴────────────── iPhone ───────────────────────────┐
│  Juego + panel «PC» (web/net/vr-link.js)                      │
│  · token en localStorage, reconexión con backoff              │
│  · aplica cal/lock/expo y bloquea sliders si corresponde      │
└───────────────────────────────────────────────────────────────┘
```

Decisiones clave:

- **Una sola verdad**: la calibración autoritativa vive en el proceso principal. La UI
  de Windows y el iPhone solo piden cambios; el servidor valida, aplica, incrementa
  `rev` y retransmite indicando `origin` (`windows` o `iphone`). No hay bucles porque
  cada lado ignora el eco de su propio origen.
- **Same-origin**: la app y el juego se sirven desde el mismo HTTP local, por lo que el
  iframe puede usar `RasmaticVR` y `RasmaticCore` sin postMessage ni puentes extra.
- **HTTP solo loopback**: cualquier pedido HTTP desde la LAN recibe 403. El iPhone usa
  exclusivamente el WebSocket `/vr`.
- **Sin Internet**: no hay nube, telemetría externa ni APIs de terceros.

### Módulo VR del juego

`web/vr/vr-preview.js` conserva el estéreo y el SBS originales y añade:

- `enableMono(view)` / `disableMono()` / `setView('center'|'left'|'right'|'sbs')`
- `spec()` — defaults, límites, controles, grupos y perfiles reales.
- `applyCal(values, origin)` — aplica números, perfil, HUD, tamaño personalizado,
  guías, viñeta y modo prueba.
- `setLocked(bool)` — bloquea `set/reset/resetGroup/loadConfig/importConfig`.
- `onChange(fn)` — avisa cambios hechos desde el panel VR del propio juego.

La cámara central es una **perspectiva de referencia** para calibrar, no una fusión
ocular exacta. No reemplaza ni altera las cámaras del VR Box.

---

## 3. Instalación y ejecución

### Requisitos

- Windows 10 u 11 (x64).
- Para desarrollar: Node.js 20 o superior (probado con Node 24).
- Para usar el instalador: nada extra (Electron y WebView2 incluidos).

### Desarrollo

```bat
cd windows-calibrator
npm install
npm start
```

La app abre en `http://127.0.0.1:8737/` (puerto con fallback 8738–8748 si está ocupado).
El puerto real se muestra en la pestaña **Conexión**.

### Pruebas

```bat
npm test
```

Ejecuta 62 pruebas con `node:test` + `ws` (spec, protocolo, seguridad, almacén,
servidor HTTP y WebSocket real). Ver sección 10.

### Smoke test de la app real

```bat
npx electron . --smoke
```

Abre la ventana, espera el juego, prueba la vista central, genera un código, guarda y
carga un perfil, bloquea/desbloquea y valida rangos. Termina con
`SMOKE_RESULT PASS 14`.

---

## 4. Primer uso: emparejar el iPhone

1. Conectá la PC y el iPhone a la **misma red Wi-Fi** (mejor un router propio o hotspot).
2. Abrí el juego en el iPhone y tocá el botón **PC**.
3. En Windows, pestaña **Seguridad → Emparejamiento → Generar código**.
   - El código tiene 6 dígitos, vence en **2 minutos** y sirve **una sola vez**.
   - Se muestra también un QR opcional (`rasmatic://pair?...`).
4. En el iPhone escribí la IP y el puerto que muestra Windows y el código.
5. Tocá **Conectar**. El iPhone recibe un token aleatorio y lo guarda en `localStorage`.
6. En Windows, **Conexión** muestra la IP/puerto y el estado en tiempo real.

Si el iPhone no conecta:

- Permití la app en el Firewall de Windows (red privada).
- Verificá que el Wi-Fi no tenga **aislamiento de clientes** (AP isolation): con eso los
  dispositivos no se ven entre sí. Usá un router propio o hotspot del iPhone/PC.
- El puerto puede haber cambiado por fallback; mirá la pestaña **Conexión**.

---

## 5. Vista principal y pantalla completa

- La vista arranca en **Central**: una sola imagen, cámara centrada, sin división.
- **Central / Ojo izq. / Ojo der. / SBS** cambian solo la vista de diagnóstico; no
  tocan la calibración ni el modo VR del iPhone.
- **HUD** oculta o muestra el HUD del juego en la vista previa.
- **Pausar** congela la vista previa local; no afecta al iPhone.
- **Captura** guarda un PNG en `Imágenes`.
- **⛶ / F11** entra en pantalla completa y oculta el panel lateral.
- **Esc** sale de pantalla completa; si no, vuelve del modo expandido.
- **⛶ (topbar)** expande la vista sin entrar en pantalla completa.

La pose del jugador se sincroniza desde el iPhone. Si movés la vista con el mouse en la
PC, la telemetría del iPhone retoma el control después de ~1,8 s sin input local.

---

## 6. Calibración

La lista de controles **no está escrita a mano**: el servidor extrae `DEFAULTS`, `SPEC`,
`CTL`, `GROUPS`, `TABS` y `PROFILES` de `web/vr/vr-preview.js`. Si el juego agrega un
parámetro, el calibrador lo muestra automáticamente (con el mismo nombre, límites,
paso, unidad y efecto).

Grupos actuales:

| Grupo | Parámetros |
| --- | --- |
| Cámara | `fov`, `camZoom`, `camDist`, `camHeight`, `camShiftX`, `camShiftY`, `camPitch` |
| 3D | `ipd`, `depth`, `convergence` |
| Lente izquierda | `eyeOffXL`, `eyeOffYL`, `eyeScaleL`, `cropL` |
| Lente derecha | `eyeOffXR`, `eyeOffYR`, `eyeScaleR`, `cropR` |
| Pantalla | `profile`, `customW`, `customH`, `zoom`, `gap`, `stageX`, `stageY`, `aspect`, `distortion`, `hudMode`, `guides`, `vignette` |
| Imagen | `brightness`, `contrast`, `saturation`, `gamma`, `sharpness` |
| Diagnóstico | `testMode` |

Valores predeterminados principales: `ipd 64`, `fov 70`, `convergence 3`, `depth 1`,
`gap 0.02`, `zoom 1`, perfil `window`, HUD `per-eye`.

Acciones:

- **Doble clic** en un slider lo vuelve a su valor predeterminado.
- **Restaurar <grupo>** devuelve solo ese grupo.
- **Restaurar toda la calibración** vuelve a fábrica (los perfiles guardados no se borran).
- Cada cambio se envía con debounce de 90 ms y se aplica de inmediato en la vista previa.

### Bloqueo de calibración

- Bloquea sliders, selects, checks y botones de restaurar en Windows.
- El servidor rechaza cambios (`locked`) aunque lleguen por WebSocket.
- El iPhone recibe `lock` y bloquea su panel VR.
- Los valores actuales **permanecen aplicados**; el juego y el Bluetooth siguen.
- Solo se desbloquea desde la PC; si hay PIN configurado, se pide.

---

## 7. Perfiles

- Crear, renombrar, duplicar, eliminar, cargar y guardar.
- «Predeterminado» no se puede borrar ni renombrar.
- Guardan solo parámetros reales de calibración.
- Al guardar/cargar/eliminar, la calibración activa se retransmite al iPhone.
- Persisten en `%APPDATA%\rasmatic-vr-calibrator\state.json` (nunca en el repositorio).
- Con la calibración bloqueada no se puede guardar, cargar ni borrar.

---

## 8. Desconexión y recuperación

Si se corta el Wi-Fi o se cierra la app:

- El juego del iPhone sigue funcionando y el Bluetooth sigue respondiendo.
- El render no se detiene; la última calibración válida queda aplicada.
- No se reinicia la escena ni se pierden parámetros.
- El iPhone reintenta con backoff exponencial (1 s, 2, 4, 8, 16, 30 s; tope 30 s,
  ±20 % de jitter, máximo 6 pasos).

Al reconectar:

- El iPhone se autentica con su token; el servidor verifica el hash.
- Recibe `welcome` con la calibración **real actual** y el estado de `lock`/`expo`.
- Si el equipo fue revocado, recibe `revoked` y debe volver a emparejarse.
- Un dispositivo desconocido no puede tomar la sesión: sin token válido no hay `welcome`.

---

## 9. Instalador

```bat
cd windows-calibrator
npm run dist
```

Genera en `windows-calibrator/release/`:

- `RASMATIC VR Calibrator Setup 1.0.0.exe` (NSIS, x64).
- `win-unpacked/` (ejecutable portable para probar).

El instalador permite elegir carpeta, crea accesos en Escritorio y Menú Inicio, y no
requiere Node. El juego se empaqueta en `resources/game` desde `../web`.

Verificación del build del 25/11/2026 (juego `0417b73dd1d31bc4`): `release/win-unpacked/RASMATIC VR
Calibrator.exe --smoke` termina con código 0, `resources/game` coincide byte a
byte con `web/` y `app.asar` contiene `ws` y `qrcode`. El NSIS x64 resultante
pesa 82.691.850 B (≈ 78,9 MiB) y no está firmado (no hay certificado de código).
La instalación real del `.exe` no se ejecutó en esta máquina: se probó el
`win-unpacked`.

Si `npm run dist` falla por falta de red o permisos de symlink, `npm run pack` genera
`win-unpacked/` y se puede usar el `.exe` directamente; documentar el error concreto.

---

## 10. Pruebas ejecutadas

```text
npm test ................ 62/62 OK
electron . --smoke ...... SMOKE_RESULT PASS 14
```

Cobertura de las pruebas:

- **Spec**: extracción real, defaults, rangos, NaN/Infinity, claves peligrosas, tope de claves.
- **Protocolo**: envelope, versión, `seq`, tamaños, dispositivo, auth, telemetría, ack.
- **Seguridad**: código de un uso, expiración, intentos, token hasheado, revocación,
  bans, PIN scrypt, `clearPin`, Expo bloquea pairing.
- **Almacén**: defaults, perfiles CRUD, predeterminado protegido, flags, persistencia y saneo.
- **WebSocket real**: hello, pair, auth, sync bidireccional con origen, rango inválido,
  bloqueo, replay, malformados, mensajes gigantes, Expo con dispositivo designado,
  revocación, cierre de sesiones, telemetría, reconexión.
- **HTTP**: loopback, traversal, CSP, MIME, `/api/spec`, métodos, 404.
- **Smoke Electron**: ventana, iframe, vista central, sliders reales, vistas, pairing,
  perfiles, bloqueo, rangos.

Regresiones del juego (sin tocar la mecánica):

```bat
node tools/test-web.js
node tools/test-pad.js
node tools/test-vr.js
node tools/check-xcode.js
```

Resultados del 25/11/2026 (juego `0417b73dd1d31bc4`): `test-web` 30/30 + offline + horizontal,
`test-pad` 21/21, `test-vr` 34/34 + mouse + `?vr=1`, `check-xcode` 123/123.

> `test-vr.js` levanta Chrome por CDP y puede tardar varios minutos.

---

## 11. Rendimiento

- Un solo proceso Electron + un renderer; sin servicios en segundo plano.
- La vista previa usa el renderer WebGL del juego, sin captura de video ni streaming.
- La telemetría se envía con throttle y solo cambia la pose; no re-renderiza la UI.
- La UI se actualiza con un `status` agregado; los sliders no se re-renderizan enteros.
- `backgroundThrottling` activo y heartbeat de 10 s con `unref`.
- Rate limiting y límites de mensajes evitan que un cliente sature CPU/RAM.

---

## 12. Limitaciones reales

- **Sin iPhone/VR Box físicos ni macOS** en este entorno: no se pudo verificar
  WKWebView, ATS, Bluetooth, lentes ni instalación del IPA. El código y la
  configuración están preparados, pero falta la prueba en hardware.
- **La vista previa es local**, no un espejo de video del iPhone. Refleja la misma
  escena y la pose recibida; efectos exclusivos del dispositivo podrían no verse
  idénticos.
- **WebSocket sin TLS** en la LAN (`ws://`). Ver `docs/EXPO_SECURITY.md` para el modelo
  de riesgo y las recomendaciones.
- **Wi-Fi de Expo**: si la red aísla clientes, no hay conexión posible. Usar router
  propio u hotspot; no se puede resolver por software.
- **Sin firma de código**: Windows SmartScreen puede advertir en el primer inicio.
- El instalador NSIS requiere red la primera vez (electron-builder descarga sus tools).

---

## 13. Archivos

```
windows-calibrator/
  electron/main.js        Proceso principal, servidor, IPC, smoke
  electron/preload.js     Puente IPC estrecho
  renderer/index.html     Interfaz
  renderer/app.js         Lógica de la UI
  renderer/app.css        Estilos
  server/vr-spec.js       Extracción y validación de la spec real
  server/protocol.js      Protocolo v1
  server/security.js      Pairing, tokens, PIN, rate limiting
  server/store.js         Persistencia local
  server/vrlink.js        WebSocket, sesiones, Expo, bloqueo
  server/http.js          HTTP loopback + CSP
  test/*.test.js          Pruebas
web/vr/vr-preview.js      Modo mono, applyCal, lock, spec
web/net/vr-link.js        Cliente iPhone
web/net/vr-link.css       Panel PC del iPhone
tools/build-ios.js        Generador canónico + espejo iOS
docs/WINDOWS_VR_CALIBRATOR.md
docs/EXPO_SECURITY.md
```

---

## 14. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| «Sin iPhone» | Firewall / otra red / AP isolation | Permitir en red privada; misma Wi-Fi; router propio |
| El código vence | Pasaron 2 minutos | Generar otro |
| «Código incorrecto» | Código viejo o mal tipeado | Generar uno nuevo; esperar si hay ban |
| El iPhone no reconecta | Token revocado | Volver a emparejar |
| La vista previa no carga | Puerto ocupado o juego incompleto | Mirar pestaña Conexión; reiniciar |
| Sliders grises | Calibración bloqueada | Desbloquear desde Seguridad |
| No se puede desbloquear | PIN olvidado | Borrar `state.json` con la app cerrada (pierde pairing y perfiles) |
| SmartScreen | Sin firma | «Más información → Ejecutar de todos modos» |
