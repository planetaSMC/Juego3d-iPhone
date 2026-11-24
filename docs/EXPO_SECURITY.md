# Seguridad del enlace y Modo Expo

Documento de seguridad del **RASMATIC VR Calibrator**: modelo de amenazas,
protecciones reales implementadas, pruebas ejecutadas, resultados y límites que quedan.

> Resumen: el calibrador está pensado para una red Wi-Fi local. No usa Internet ni
> servicios externos. El Modo Expo reduce la superficie de ataque a **un solo iPhone
> previamente emparejado**, bloquea vinculaciones nuevas y bloquea la calibración.

---

## 1. Alcance y activos a proteger

| Activo | Por qué importa |
| --- | --- |
| Calibración VR | Un cambio malicioso puede dejar el juego injugable en plena Expo |
| Sesión del iPhone | Un visitante no debe poder tomar el control ni desconectar |
| Tokens de dispositivo | Permiten reconectarse sin código; deben ser secretos |
| PIN de administración | Autoriza desbloquear, revocar, restaurar y desactivar Expo |
| Estabilidad del juego | Floods o mensajes malformados no deben congelar el render |
| Privacidad | La telemetría incluye pose/estado de la partida; no debe salir de la LAN |

Fuera de alcance: seguridad física de la PC, seguridad del router, malware local,
compromiso del sistema operativo o del iPhone.

---

## 2. Modelo de amenazas

Se asume que un visitante puede:

1. Estar conectado a la misma Wi-Fi y conocer la IP/puerto de la PC.
2. Escanear puertos y abrir conexiones WebSocket.
3. Enviar JSON malformado, valores fuera de rango, `NaN`, `Infinity`, mensajes enormes.
4. Reintentar códigos de emparejamiento o tokens al azar.
5. Repetir mensajes capturados (replay).
6. Abrir muchas conexiones o mandar muchos mensajes (flood / DoS).
7. Intentar reconectar en bucle para consumir CPU.
8. Tocar la PC cuando el operador se distrae (acceso físico).

No se asume que la red de la Expo sea confiable ni que aísle clientes.

---

## 3. Identidad y emparejamiento

- **Código temporal**: 6 dígitos generados con `crypto.randomInt`.
- **Vigencia**: 120 s; se guarda solo `SHA-256(salt + ':' + código)`.
- **Un solo uso**: al canjearlo se invalida y se borra.
- **Intentos**: máximo 5 por código; luego el código se invalida.
- **Generación limitada**: bucket de 0,5/s con ráfaga de 3 (evita spam de códigos).
- **Dispositivo**: id aleatorio de 16–64 hex, nombre/modelo saneados y limitados.
- **Token**: 32 bytes aleatorios en base64url (~256 bits). Se entrega **una sola vez**
  en el `welcome` del emparejamiento.
- **Almacenamiento**: solo `SHA-256('rasmatic-vr-token\0' + token)` en `state.json`.
- **Comparación**: `crypto.timingSafeEqual` sobre buffers hex.
- **Revocación**: borra el dispositivo; su token deja de servir inmediatamente.
- **Desconocidos**: sin token válido no hay `welcome`; se responde `error` y se cuenta
  el intento.

No se confía en IP, MAC ni nombre del dispositivo: son datos informativos, no identidad.

El emparejamiento nuevo solo se genera **desde la PC** y, si hay PIN configurado, lo
exige. El iPhone nunca crea códigos.

---

## 4. Administración en Windows

- **PIN opcional de 4–8 dígitos**, hasheado con **scrypt** (`N=16384, r=8, p=1`).
- Acciones que exigen PIN si está configurado:
  - desbloquear la calibración,
  - activar/desactivar Modo Expo,
  - designar el dispositivo de Expo,
  - generar un código de emparejamiento,
  - revocar un dispositivo,
  - cerrar todas las sesiones,
  - restaurar la calibración predeterminada,
  - quitar el PIN.
- Intentos de PIN: 5 fallos / 5 min → ban de 5 min, duplicando hasta 15 min.
- El PIN es independiente del token del iPhone: comprometer uno no da el otro.
- Las acciones críticas piden confirmación en un modal.
- La UI **nunca muestra tokens completos**; el código de pairing se muestra solo
  mientras está vigente.

Si no hay PIN, cualquier persona con acceso físico a la PC puede administrar. Para una
Expo se recomienda configurarlo.

---

## 5. Transporte y red

- **HTTP**: escucha en `0.0.0.0` para poder aceptar el WebSocket, pero el handler HTTP
  rechaza cualquier request cuya IP de origen no sea loopback (403). La app y el juego
  solo se sirven a `127.0.0.1`.
- **WebSocket**: único endpoint LAN, `ws://IP:8737/vr`. No hay otros servicios.
- **Sin TLS**: el tráfico LAN no está cifrado. Ver limitaciones (sección 10).
- **Sin Internet**: no hay descargas, nube, telemetría ni APIs externas.
- **CSP** en la app (`default-src 'self'`, sin `unsafe-eval`) y en el juego
  (`frame-ancestors 'self'`, `connect-src 'self' ws:`).
- **Electron**: `contextIsolation`, `sandbox`, `nodeIntegration: false`,
  `webSecurity`, permisos denegados, ventanas nuevas denegadas, navegación restringida
  al origen local, DevTools solo con `--dev`/`--smoke`.
- **IPC estrecho**: el renderer solo puede invocar canales de una allowlist; no tiene
  acceso a Node ni al filesystem.

En una Expo, la recomendación es **router propio o hotspot** con WPA2/WPA3, sin
aislamiento de clientes (AP isolation), y no la Wi-Fi pública del lugar.

---

## 6. Modo Expo

Al activarlo (requiere PIN si existe):

1. Exige al menos un dispositivo emparejado.
2. Con varios equipos, exige designar **un** `expoDevice`.
3. **Bloquea vinculaciones nuevas** (`createPairing` → `expo`) y cancela el código
   vigente.
4. **Bloquea la calibración** (`lock = true`) y rechaza cambios por WebSocket.
5. Fuerza `testMode = false` (no se puede activar el modo de prueba).
6. Cierra sesiones de equipos no designados y rechaza su `auth` (`expo_device`).
7. Limita conexiones: **2 clientes / 1 autenticado** (frente a 8/4 normales).
8. Cierra conexiones no autenticadas y las que intenten emparejarse.
9. El juego y el Bluetooth **siguen funcionando**; el render no se detiene.
10. El estado se muestra en la topbar, en el panel de seguridad y en el iPhone.

La designación se puede cambiar desde la PC (con PIN). Si se revoca el dispositivo
designado, Expo se apaga y la designación se limpia.

Desactivar Expo vuelve a permitir vinculaciones, pero **no desbloquea** la calibración:
son acciones separadas.

---

## 7. Bloqueo de calibración

Con `lock = true`:

- El servidor rechaza `cal` del iPhone (`locked`) y `applyFromWindows` (`locked`).
- El renderer deshabilita sliders, selects, checks, restauraciones y perfiles.
- El iPhone recibe `lock` y bloquea su panel VR local.
- La calibración actual **permanece aplicada**; no se reinicia nada.
- Solo se desbloquea desde la PC, con PIN si está configurado.
- «Restaurar» desde el panel de seguridad es la única vía que puede restaurar con la
  calibración bloqueada, y exige PIN.

---

## 8. Validación y límites

### Mensajes

| Control | Valor |
| --- | --- |
| Tamaño máximo de mensaje | 16 KB (`maxPayload` de `ws` + chequeo propio) |
| Tipos permitidos | `pair`, `auth`, `cal`, `state`, `ping`, `ack` |
| Versión | `v = 1` obligatoria |
| `seq` | entero 1..2³¹−1, estrictamente creciente (antireplay) |
| Handshake | 8 s para autenticarse |
| Heartbeat | ping cada 10 s; sin pong se cierra |
| Errores por conexión | > 12 mensajes inválidos → cierre |
| Conexiones | 8 totales / 4 autenticadas (2/1 en Expo) |
| Conexiones HTTP | `maxConnections = 64` |

### Rate limiting

| Bucket | Ritmo | Ráfaga |
| --- | --- | --- |
| Conexiones por IP | 0,25/s | 12 |
| Mensajes por cliente | 40/s | 80 |
| Mensajes por IP | 120/s | 240 |
| Generación de códigos | 0,5/s | 3 |

### Fallos y bans

| Evento | Límite | Ban inicial | Ban máximo |
| --- | --- | --- | --- |
| Código de pairing incorrecto | 5 / 60 s | 30 s | 5 min |
| Auth incorrecta | 6 / 60 s | 30 s | 5 min |
| PIN incorrecto | 5 / 5 min | 5 min | 15 min |

Los bans son progresivos (duplican) y se aplican por IP (auth/pairing) o global (PIN).
Al superar el límite de intentos de un código, el código se invalida.

### Calibración

- Solo claves de la allowlist real (`spec.spec`, enums, bools, ints).
- Números finitos (`Number.isFinite`), dentro de `[min, max]`.
- Rechazo explícito de `NaN`, `Infinity`, strings numéricos y tipos incorrectos.
- Máximo 64 claves por mensaje.
- Claves prohibidas: `__proto__`, `constructor`, `prototype`.
- Enums y booleanos validados por tipo; enteros sin decimales.
- Un valor inválido **rechaza el mensaje completo**; no se aplica parcialmente.
- La telemetría valida pose (`x,y,z,yaw,pitch`), estado, tiempo, pedidos, cargas y
  marcador; valores absurdos se rechazan.

### Sesiones

- Reconexión del mismo `deviceId` reemplaza la sesión anterior (no ocupa cupo).
- Revocación y cierre de sesiones envían `revoked` y cierran el socket.
- El servidor es la única fuente de verdad; el cliente no puede “empujar” estado
  arbitrario ni saltarse el lock.

---

## 9. Pruebas realizadas y resultados

Suite automática (`npm test` en `windows-calibrator/`): **62/62 OK**.

Casos relevantes de seguridad:

| Prueba | Resultado |
| --- | --- |
| Código de un solo uso; token no aparece en disco | OK |
| Código incorrecto cuenta intento y no empareja | OK |
| Código vencido rechazado | OK |
| 5 intentos inválidos invalidan el pairing | OK |
| Token inválido / dispositivo desconocido rechazado | OK |
| Revocación efectiva | OK |
| Ban tras intentos fallidos de auth | OK |
| PIN scrypt, cambio y `clearPin` | OK |
| Expo bloquea generación de códigos | OK |
| Expo exige dispositivo designado y rechaza el resto | OK |
| Revocar el dispositivo de Expo apaga Expo | OK |
| Calibración bloqueada rechaza iPhone y Windows | OK |
| Valor fuera de rango/NaN no modifica el estado | OK |
| Replay de `seq` cierra la conexión | OK |
| JSON malformado rechazado y cierre | OK |
| Mensaje > 16 KB cortado por `ws` | OK |
| Telemetría inválida rechazada | OK |
| Reconexión reemplaza la sesión anterior | OK |
| Cerrar sesiones no borra la calibración | OK |
| HTTP: traversal, métodos, 403 no-loopback, CSP | OK |
| Smoke Electron (14 chequeos, app real) | OK |

Simulación multi-dispositivo: las pruebas WebSocket crean dos iPhones (A y B),
emparejan ambos, autentican, comprueban el reenvío con `origin`, la designación de Expo
y el rechazo del equipo no autorizado.

---

## 10. Limitaciones y riesgos residuales

1. **WebSocket sin cifrar en la LAN.** Un atacante con acceso a la red (o ARP spoofing)
   podría leer calibración, telemetría y, durante el emparejamiento, el token inicial.
   Mitigaciones: emparejar en una red confiable, usar router/hotspot propio, revocar
   tokens después del evento, no reutilizar redes públicas. TLS con certificado
   autofirmado requeriría instalar un perfil de confianza en el iPhone; no se implementó
   para no romper el flujo de instalación.
2. **Wi-Fi con aislamiento de clientes** impide la conexión; no es un problema de
   seguridad del calibrador y no se puede resolver por software.
3. **Acceso físico a la PC** permite administrar si no hay PIN. Configurarlo en Expo.
4. **Sin firma de código.** SmartScreen puede advertir; no afecta la seguridad del
   protocolo.
5. **El rate limiting vive en memoria.** Reiniciar la app limpia bans y contadores; los
   tokens y el PIN persisten.
6. **Un dispositivo emparejado y comprometido** puede conectarse hasta que se lo revoque.
   Revisar el panel de seguridad y revocar equipos desconocidos.
7. **No hay attestation de hardware**: el token prueba posesión, no que el iPhone sea
   “el iPhone de la Expo”.
8. **La UI de Windows confía en el proceso principal.** Un usuario con control total
   del sistema operativo puede editar `state.json`; está fuera del modelo de amenazas.
9. **Sin auditoría externa.** Las protecciones son razonables para el caso de uso, pero
   no reemplazan una revisión de seguridad profesional.
10. **La telemetría no es un canal de control del juego.** Solo actualiza la vista previa
    de la PC; no permite que un visitante mueva al jugador del iPhone.

---

## 11. Procedimiento recomendado para la Expo

**Antes**

1. Usar un router propio o hotspot con WPA2/WPA3; desactivar AP isolation.
2. Configurar PIN de administración.
3. Emparejar **solo** el iPhone de la demo.
4. Activar **Modo Expo** y verificar el estado en la topbar y en el iPhone.
5. Confirmar que la calibración está bloqueada y que el juego sigue respondiendo al
   Bluetooth.
6. Probar desconectar/reconectar el Wi-Fi del iPhone.

**Durante**

- No generar códigos nuevos ni desactivar Expo.
- Revisar el panel de seguridad ante cualquier evento raro.
- Si un visitante intenta conectarse, el servidor lo rechaza y registra el intento.

**Después**

- Desactivar Expo, cerrar sesiones y revocar el dispositivo si el equipo se va a usar
  en otro entorno.
- Revisar los eventos recientes (sin tokens) y rotar el PIN si estuvo expuesto.

**Emergencia**

- Si algo falla: desbloquear con PIN, restaurar calibración, cerrar sesiones.
- Si no hay acceso: cerrar la app; el juego del iPhone sigue funcionando con la última
  calibración y el Bluetooth.
