# V20 · Configuración VR / Head Tracking desde Windows

La app de Windows (`windows-calibrator`) es el centro de configuración de
**RASMATIC VR**. La sección **HEAD TRACKING** se agregó al mismo panel de
calibración VR que ya existía en V19, reutilizando el enlace WebSocket local.

## 1. Dónde está

1. Abrir `windows-calibrator` (`npm start` o el instalador).
2. Conectar el iPhone con el código de la PC.
3. En el panel de calibración, pestaña **HEAD TRACKING**.

No hay que reinstalar la app del iPhone: los cambios viajan por el enlace y se
aplican en caliente.

## 2. Controles

| # | Control | Clave | Rango | Predeterminado |
|---|---|---|---|---|
| 1 | Head Tracking activado | `htEnabled` | sí / no | sí |
| 2 | Sensibilidad horizontal | `htSensX` | 0,20 – 2,50 × | 1,00 |
| 3 | Sensibilidad vertical | `htSensY` | 0,20 – 2,50 × | 1,00 |
| 4 | Sensibilidad de inclinación lateral | `htSensRoll` | 0,20 – 2,50 × | 1,00 |
| 5 | Suavizado | `htSmoothing` | 0,03 – 0,45 s | 0,12 |
| 6 | Velocidad de respuesta | `htResponse` | 0,50 – 2,00 × | 1,00 |
| 7 | Calibración inicial | `htCalibrate` | acción (0/1) | 0 |
| 8 | Recentrado | `htRecenter` | acción (0/1) | 0 |
| 9 | Invertir eje horizontal | `htInvertX` | sí / no | no |
| 10 | Invertir eje vertical | `htInvertY` | sí / no | no |

Además:

- Cada grupo tiene **Restaurar head tracking** (vuelve a los predeterminados).
- El botón **RECENTRAR** toma la orientación actual como cero.
- El botón **CALIBRAR** aplica la calibración inicial (misma operación de
  referencia que el recentrado, expuesta con nombre propio).
- La pestaña muestra los valores actuales del iPhone, no solo los de Windows.

Los límites y valores por defecto se extraen del propio juego
(`web/vr/vr-preview.js` → `DEFAULTS`, `SPEC`, `CTL`, `GROUPS`, `TABS`), así que
Windows no puede inventar sliders distintos a los del iPhone.

## 3. Cómo se aplican en el iPhone

```
Windows (slider)
  → vr-spec.sanitizeCal / validateCal
  → vrlink.applyFromWindows(values, 'windows')
  → store.setCalibration (persistencia)
  → broadcast { t:'cal', rev, origin:'windows', values }
  → iPhone web/net/vr-link.js
  → RasmaticVR.applyCal(values, 'remote')
  → vr-preview.applyHeadSettings()
  → RasmaticHeadTracking.applyConfig({...})
  → Core Motion (yaw/pitch/roll) con sensibilidad, filtro e inversión
```

- `applyConfig` acepta un objeto **parcial**: solo cambia las claves presentes.
- Los valores numéricos se recortan a su rango; los tipos incorrectos se
  ignoran.
- Si el objeto no contiene ninguna clave válida, `applyCal` devuelve `false` y
  no guarda nada.
- `htRecenter` y `htCalibrate` son acciones de un solo uso: se envían al
  iPhone y el servidor las vuelve a poner en 0 para que una reconexión no
  recentre la cabeza otra vez.

## 4. Confirmación, revisión y persistencia

- Cada cambio de calibración incrementa `rev` en el servidor.
- El iPhone descarta paquetes con `rev` menor o igual al último aplicado.
- El iPhone responde `{ t:'ack', rev }`; Windows lo usa para marcar el estado.
- El servidor guarda la calibración en disco y la reenvía en `welcome` al
  reconectar. El iPhone también la guarda en `localStorage`
  (`rasmatic.vr.settings.v2`).
- El Head Tracking guarda su propia copia en `rasmatic.ht.*`.
- Al cerrar y abrir la app, se conserva la última configuración válida, haya o
  no PC conectada.

## 5. Desconexión y recuperación

- Si se corta el Wi-Fi o se cierra Windows, el iPhone conserva la última
  configuración aplicada y sigue jugando.
- `vr-link.js` reintenta con retroceso exponencial (máximo 30 s) y muestra el
  estado **Conectado / Conectando / Desconectado** en el botón de enlace.
- Al reconectar, `welcome` trae la calibración vigente y se vuelve a aplicar.
- No se aplican mensajes parciales sin `rev` ni valores inválidos.

## 6. Control local de emergencia

El iPhone puede cambiar el Head Tracking sin Windows:

- En el panel **VR** del juego, pestaña **HEAD TRACKING**:
  - activar/desactivar,
  - sensibilidad X/Y/roll,
  - suavizado y respuesta,
  - inversión X/Y,
  - **Recentrar** y **Calibrar**.

Esto cubre la pérdida de conexión: si Windows no está, el jugador puede
apagar el Head Tracking o recentrarlo desde el teléfono.

## 7. Seguridad y validación

- La calibración se rechaza si está **bloqueada** desde la PC (`cal:set`
  devuelve `{ ok:false, code:'locked' }`).
- En modo **Expo** se rechaza `testMode`; el resto de la configuración sigue
  permitida.
- El servidor valida tipo y rango antes de persistir o retransmitir.
- El iPhone valida de nuevo antes de aplicar; nunca confía en el paquete.
- El enlace sigue siendo solo Wi-Fi local (loopback + LAN), sin nube.

## 8. Archivos implicados

| Archivo | Función |
|---|---|
| `web/headtracking/head-tracking.js` | sensores, filtro, recentrado, `applyConfig` |
| `web/vr/vr-preview.js` | claves `ht*`, pestaña HEAD TRACKING, `applyCal` |
| `web/net/vr-link.js` | WebSocket, `rev`, `ack`, reconexión |
| `windows-calibrator/server/vr-spec.js` | extracción de la spec real |
| `windows-calibrator/server/vrlink.js` | broadcast y confirmación |
| `windows-calibrator/server/store.js` | persistencia y acciones de un uso |
| `windows-calibrator/renderer/app.js` | switches, sliders y botones |

## 9. Pruebas

- `node tools/test-v20.js` → V20-12 a V20-18: configuración, persistencia,
  valores inválidos, puente Windows-iPhone y control local.
- `cd windows-calibrator && npm test` → 62/62 (spec, validación, protocolo,
  bloqueo, Expo, reconexión).
- La prueba con sensores físicos y con un iPhone real queda pendiente; ver
  `limitations.md`.
