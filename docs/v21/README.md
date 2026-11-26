# V21 · Gameplay, interacción y animaciones

V21 evoluciona **RASMATIC VR V20.1** sin cambiar la identidad de la app ni el
escenario base de la farmacia. Se centra en que la farmacia se juegue de verdad:
mira, pedido visual, cinta funcional, fila de clientes, animaciones y menú de
inicio con cuenta regresiva.

- **App:** RASMATIC VR · `com.rasmatic.lugar3d`
- **Rama:** `v21-gameplay-animation`
- **Base:** V20.1 (`fix/v20.1-core-motion`, commit `b008e34`)
- **Motor:** Three.js r128, WebGL, WKWebView
- **VR:** SBS, IPD, convergencia, distorsión y Head Tracking intactos

## 1. Qué cambia para el jugador

### Menú de inicio
Al cargar aparece un menú con **INICIAR**, la selección de dificultad y una
explicación breve. La partida **no** empieza sola y ya no hay que caminar al
mostrador para arrancar. Al pulsar INICIAR aparecen **3, 2, 1** en pantalla y
solo después corre el reloj de 3:00.

### Mira y selección
Una mira permanente ocupa el centro de la vista. El rayo sale de la cámara real
—incluido el offset de Head Tracking en VR— y solo selecciona una caja visible.
La caja apuntada se rodea con un **contorno amarillo** (carcasa BackSide +
aristas). Al mirar afuera el contorno desaparece; al apuntar a otra caja se
traslada. No hay etiquetas flotantes sobre los medicamentos.

### Pedido por imagen
El HUD muestra la **imagen real de la caja** del medicamento pedido, generada
desde la misma textura del producto. No se muestra el nombre como elemento
principal. Al entregar el pedido correcto, la imagen cambia por la del siguiente
cliente.

### Entrega por cinta
El jugador recoge la caja con la mira y la coloca en la cinta. La caja viaja por
el recorrido en L, sube la rampa y llega al mostrador. El empleado la recoge,
hace la animación de entrega y se la pasa al cliente. La validación ocurre al
final: si el color no coincide, no suma, vuelve al stock y el cliente sigue
esperando. Si coincide, sube el puntaje y la fila avanza.

### Fila de clientes
Tres clientes ocupan posiciones fijas frente al mostrador, cada uno con su
pedido. El cliente atendido se retira caminando; los demás avanzan y entra un
cliente nuevo. Tienen espera, caminata, recepción y salida animadas.

### Escenario
- El cartel principal dice **FARMACIA RASMATIC**; se eliminó “Farmacia 16
  horas” y el cartel “Abierto · 16 hs”.
- Los medicamentos son cajas de color con etiqueta central y patrones
  distintos; se mantienen los recursos procedurales del HTML.
- El empleado mide 0,86 de la escala del modelo y los clientes 0,82–0,86, en
  proporción con el ojo del jugador (3,6 unidades).
- Se eliminó la **cinta de la ventanilla de la máquina**. La máquina conserva
  su estructura, su brazo y su ventanilla; la única cinta funcional es la del
  jugador.

## 2. Animaciones

| Elemento | Animación |
|---|---|
| Cliente esperando | respiración, balanceo de brazos y cabeza |
| Cliente caminando | piernas y brazos alternados, bob |
| Cliente recibiendo | brazos arriba, pequeña reacción |
| Cliente saliendo | caminata hacia la salida |
| Empleado | espera, alcance, recogida y entrega |
| Caja en mano | acompaña la cámara con una caja real |
| Caja en cinta | traslado, giro y subida por la rampa |
| Cinta | textura desplazada a la misma velocidad que las cajas |
| Contorno | pulso suave de opacidad |
| Menú | aparición, botón y transición |
| Cuenta regresiva | escala/opacidad 3 → 2 → 1 |

## 3. Archivos principales

| Archivo | Cambio |
|---|---|
| `web/mobile/game.js` | mira, pedido por imagen, cinta, cola, menú, cuenta, animaciones |
| `web/v20/pharmacy-scene.js` | carteles, cajas de color, escala, cinta de máquina eliminada, API de cinta/imagen |
| `web/v20/pharmacy-core.js` | bloqueo de movimiento en menú/cuenta; cámara intacta |
| `web/vr/vr-preview.js` | `aimQuaternion()` para la mira con Head Tracking |
| `web/v21/v21.css` | mira, menú, cuenta regresiva y pedido visual |
| `web/index.html` | carga de `v21.css`, versión `v21` |
| `tools/check-xcode.js` | guardas V21 |
| `tools/test-v21.js`, `tools/test-v21-suite.js` | suite nueva |
| `tools/test-suite.js`, `tools/test-vr-suite.js`, `tools/test-web.js` | adaptación al menú/cinta |

## 4. Compatibilidad

Se conservan:

- VR SBS, HUD por ojo, IPD, convergencia, distorsión, zoom y perfiles.
- Head Tracking con Core Motion y su configuración desde Windows.
- Recentrado, calibración, sensibilidad X/Y/roll, suavizado, respuesta e
  inversión.
- Mando Bluetooth y joystick táctil opcional.
- Los tres modos (`film`, `model`, `place`) y las tres dificultades.
- Partida de 3 minutos, puntaje, bot/CNC, victoria/derrota y revancha.

La mira también funciona en VR: el rayo usa `RasmaticVR.aimQuaternion()`, que
incluye el offset de cabeza, y el HUD (incluida la mira) se replica por ojo.

## 5. Pruebas

```powershell
node tools/test-v21.js
node tools/test-v20.js
node tools/test-web.js
node tools/test-vr.js
node tools/test-pad.js
cd windows-calibrator; npm test
```

Resultados de la última ejecución: ver `testing-report.md`.

Compilación real: **BUILD SUCCEEDED** en GitHub Actions (Xcode 16.4, run
45880086744). IPA sin firmar de 840.012 bytes, SHA-256
`4287E5FE…533588`, con `www/v21/v21.css` verificado. La firma e instalación en
iPhone siguen pendientes.

## 6. Documentos V21

- `conveyor-delivery.md` — recorrido, velocidad, validación y animaciones.
- `start-menu.md` — menú, cuenta regresiva y congelación del reloj.
- `aim-and-queue.md` — mira, contorno, pedido por imagen y fila.
- `testing-report.md` — pruebas y evidencias.
- `limitations.md` — lo que no se validó en hardware real.
