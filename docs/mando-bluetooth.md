# Mando Bluetooth en el iPhone

El juego se puede jugar con el joystick táctil, pero la idea de esta versión es
usar un **mando Bluetooth conectado directamente al iPhone**, con el teléfono
dentro de unas VR Box. Esta guía explica cómo se conecta, qué hace cada botón y
qué se probó realmente.

> **Importante:** el mando se empareja con **iOS**, no con la PC. La PC solo se
> usa para compilar e instalar la app; una vez instalada, el iPhone y el mando
> funcionan solos, sin cables y sin Windows.

---

## 1. Dos caminos, un solo mando

La app tiene dos formas de leer un mando y elige **una sola** para que una
pulsación nunca entre dos veces:

| Dónde se juega | Cómo se lee el mando | Archivo |
|---|---|---|
| **App iOS** (WKWebView) | Framework nativo `GameController` de Apple | `ios/RasmaticLugar3D/GamepadBridge.swift` |
| **Safari / PWA** | Gamepad API del navegador | `web/ios/ios-bridge.js` |

La app inyecta `window.__RASMATIC_NATIVE__` antes de cargar la página
(`WKUserScript`, `.atDocumentStart`). Al verlo, el JavaScript apaga el sondeo de
la Gamepad API y usa el puente nativo. En Safari ese marcador no existe, así que
se usa la Gamepad API. No hay forma de que las dos vías estén activas a la vez.

**Por qué el puente nativo es el camino principal:** en varias versiones de iOS
la Gamepad API de WKWebView lista los mandos de PlayStation/Xbox con los ejes
vacíos o directamente no los ve. `GameController` sí los entrega normalizados
(PS4, PS5, Xbox y MFi), así que la app no depende de esa limitación.

---

## 2. Emparejar el mando con el iPhone

No hace falta jailbreak ni ninguna app extra: iOS trae el soporte de mandos.

1. Abrir **Ajustes → Bluetooth** en el iPhone y dejarlo en esa pantalla.
2. Poner el mando en modo emparejamiento:

   | Mando | Cómo ponerlo en emparejamiento |
   |---|---|
   | **DualSense (PS5)** | Mantener **PS + Create** hasta que la barra de luz parpadee rápido |
   | **DualShock 4 (PS4)** | Mantener **PS + Share** hasta que la barra de luz parpadee |
   | **Xbox One / Series** | Mantener el botón de emparejamiento (arriba, junto al USB) hasta que el logo parpadee |
   | **Switch Pro** | Mantener el botón de sincronización (arriba, junto al USB) |
   | **MFi** | Seguir el instructivo del fabricante |

3. En la lista de Bluetooth del iPhone aparece el mando. Tocarlo.
4. Cuando figure como **Conectado**, abrir la app. En el juego aparece el aviso
   **“Mando conectado: <nombre>”** durante unos segundos.

### Compatibilidad

- **iOS 15 o posterior** (el mínimo de la app).
- PlayStation 4 y Xbox One: compatibles desde iOS 13.
- PlayStation 5 (DualSense) y Xbox Series: compatibles desde iOS 14.5.
- Mandos MFi: los que anuncian el perfil extendido.
- Switch Pro / Joy-Con: las versiones recientes de iOS los aceptan; si tu
  iPhone no los lista en Bluetooth, esa versión de iOS no los soporta.
- Se usa **un mando a la vez**: si hay varios conectados, el puente toma el
  último que usó el usuario (`GCController.current`) y, si no, el primero con
  sticks.

**Antes de emparejar:** apagar la consola o desconectar el mando de la PC. Un
mando que ya está conectado a otro equipo a veces no entra en modo
emparejamiento.

---

## 3. Mapeo exacto

Es el mismo mapeo que `GamepadManager.kt` en Android:

| Entrada | Acción |
|---|---|
| **Stick izquierdo** | Mover al personaje |
| **Cruceta** | Mover (se suma al stick izquierdo) |
| **Stick derecho** | Girar la cámara / mirar |
| **L1 mantenido** o **L2 a fondo** | Correr (2,4×) |
| **A**, **R1**, **R2** | Interactuar (hablar, recoger, entregar) |
| **B** o **Start/Options** | Pausa; en la partida, “Atrás” |
| **X** | Abrir/cerrar el panel VR (menú) |
| **Y** | Volver al inicio |
| **Select/Create/View** | Abrir/cerrar el menú de destinos (dock) |

Notas:

- **B/Start en la partida** hace lo mismo que el botón físico Atrás de Android:
  pide confirmación para salir y, en el resultado, vuelve al vestíbulo. En iOS no
  existe un botón Atrás, por eso se reenvía a `RasmaticAndroid.onBack()`.
- **X abre el panel VR**, no el dock: en la app el dock original está oculto y
  el menú real de iOS es el panel de ajustes VR (activar, ajustar, salir).
- **Y y Select** se reenvían como `home` y `dock`. En la partida el branch de
  arena los acepta sin efecto, igual que en Android.
- **Home/PS** puede quedar reservado por iOS (Siri, multitarea). No se usa para
  el juego.

### Límites reales dentro de la partida

- El juego es una partida única: no hay un “atrás” que vuelva a un menú. En
  Android, el botón físico Atrás pide confirmación y el segundo toque cierra la
  app. **iOS no permite cerrar una app por código**, así que en iPhone el primer
  B/Start muestra el aviso heredado del juego y el segundo no cierra nada. En el
  panel de resultado, B/Start sí vuelve al vestíbulo (`toIdle`).
- Por la misma razón, el botón **Salir** del menú de pausa está oculto en iOS:
  no tendría efecto. Para salir de la app se usa el gesto/botón de inicio del
  iPhone.
- **Y** y **Select** llegan al juego, pero la partida no tiene un lobby ni un
  dock visibles: el branch de arena los ignora, exactamente como en Android. El
  mapeo existe y se reenvía; no se inventó una acción nueva.

### Zona muerta y gatillos

- Zona muerta de los sticks: **0,18** (igual que Android). Por debajo de eso el
  valor se considera cero y el personaje no se mueve solo.
- Un gatillo cuenta como pulsado a partir de **0,5**. L2 a fondo corre; R2 a
  fondo interactúa.
- La cruceta se suma al stick izquierdo y el resultado se limita a −1…1.

---

## 4. Cómo funciona el puente nativo

`GamepadBridge.swift`:

1. Escucha `GCControllerDidConnect` y `GCControllerDidDisconnect`.
2. Sondea el mando a **60 Hz** con un `Timer` en el run loop principal.
3. Lee sticks, cruceta, gatillos y botones; aplica zona muerta y límites.
4. Envía el estado al JavaScript **solo cuando cambia**, en milésimas enteras
   para no depender del separador decimal del idioma:

   ```js
   RasmaticNativeGamepad.raw('mx,my,lx,ly,run')   // p. ej. '0,1000,0,0,1'
   RasmaticNativeGamepad.press('interact')        // flanco de bajada
   RasmaticNativeGamepad.status(true, 'DualSense Wireless')
   ```

5. El JavaScript (`web/ios/ios-bridge.js`) recibe esos valores y llama a la
   misma superficie que usa Android:

   ```js
   RasmaticInput.gamepad({ mx, my, lx, ly, run })
   RasmaticInput.press('interact' | 'pause' | 'menu' | 'home' | 'dock')
   RasmaticInput.gamepadStatus(conectado, nombre)
   ```

No se reescribió el juego: el puente habla con la API pública que ya existía.
Los botones se envían por **flanco** (solo al pasar de suelto a pulsado), así
que mantener A no dispara la acción 60 veces por segundo. Además hay
deduplicación en Swift (estado anterior) y en JavaScript (estado anterior de
cada botón).

### Aviso y controles táctiles

- Al conectar: aviso **“Mando conectado: <nombre>”** (`#ras-pad-toast`) y clase
  `ras-pad-on` en el `<body>`.
- Con mando conectado se ocultan el joystick táctil, el botón **CORRER**, el de
  pausa y el botón contextual. En VR se ocultan también el badge y los controles
  que quedarían dentro de cada ojo.
- Al desconectar: aviso **“Mando desconectado”**, se limpia el estado analógico
  (para que el personaje no siga caminando) y **vuelven solos** los controles
  táctiles.
- El juego **nunca se bloquea** si no hay mando: el puente simplemente no envía
  nada y se juega con el joystick táctil.

### Reconexión y segundo plano

- iOS reconecta solo un mando ya emparejado. El puente escucha la notificación y
  vuelve a anunciarlo.
- Al terminar de cargar la página, `webViewDidLoad()` reenvía el estado actual:
  si el mando ya estaba conectado, el aviso aparece igual.
- Al volver del segundo plano, el juego reanuda y el estado analógico se
  reaplica; no hace falta mover el stick para “despertarlo”.
- Si se desconecta a mitad de partida, la partida sigue y el joystick táctil
  vuelve inmediatamente.

---

## 5. Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| El mando no aparece en Bluetooth | No está en modo emparejamiento, está conectado a la consola/PC o no tiene batería. Apagar la consola, desconectarlo del otro equipo y repetir el paso 2. |
| Aparece en Bluetooth pero el juego no reacciona | Cerrar y abrir la app; comprobar que el aviso “Mando conectado” aparece. Si no aparece, el mando no está entregando datos a iOS (probarlo en Ajustes → Bluetooth o con otro juego). |
| El aviso aparece y desaparece | El mando se desconectó por batería o distancia. Cargarlo y volver a emparejar. |
| El personaje se mueve solo | Stick con deriva. La zona muerta es 0,18; si persiste, calibrar o cambiar el mando. |
| El joystick táctil no vuelve | Desconectar y volver a conectar el mando; si sigue, cerrar y abrir la app. |
| B/Start no abre el menú de pausa | En la partida B/Start es “Atrás” a propósito. Para el panel VR usá **X**. |
| El botón PS/Xbox no hace nada | iOS lo reserva para el sistema. No es un fallo del juego. |
| Dos mandos conectados y responde uno | Es intencional: se usa un solo mando (el último que se usó). |
| Latencia o tirones | Batería baja, interferencia o modo de bajo consumo. Acercar el mando al iPhone y evitar USB 3.0 cerca del Bluetooth. |
| En Safari funciona distinto que en la app | Son dos caminos distintos (Gamepad API vs. GameController). La app es la vía recomendada. |

---

## 6. Qué se probó y qué no

**Probado (Windows, navegador Chromium con viewport de iPhone):**

- `node tools/test-pad.js` → **21/21** casos (P01–P14 y M01–M08).
- Se inyecta `__RASMATIC_NATIVE__` antes de cargar la página, igual que
  `GameViewController.swift`, y se llama al puente con el mismo protocolo que
  usa Swift (`raw`, `press`, `status`).
- Cubre: detección, aviso con nombre, sticks, cruceta, correr 2,4×, A/B/X/Y/
  Select, desconexión/reconexión, ausencia de doble entrada, ocultado y
  restauración del joystick táctil, y VR móvil con mando.

**No probado (requiere hardware):**

- Un mando Bluetooth real conectado a un iPhone real.
- El framework `GameController` dentro de iOS (no hay macOS ni iPhone acá).
- La latencia real por Bluetooth y el comportamiento con batería baja.
- Mandos MFi concretos y mandos de Switch en distintas versiones de iOS.

Nada de eso se declara como probado. Ver `docs/pruebas.md`.
