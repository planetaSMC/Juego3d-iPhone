# V21 · Gameplay, interacción y animaciones

V21 evoluciona **RASMATIC VR V20.1** sin cambiar la identidad de la app ni el
escenario base de la farmacia. Se centra en que la farmacia se juegue de verdad:
mira, pedido visual, cinta funcional, fila de clientes, animaciones y menú de
inicio con cuenta regresiva.

- **App:** RASMATIC VR · `com.rasmatic.lugar3d`
- **Rama V21.2:** `main`
- **Base:** V21 en `main` (merge de V20.1 + V21)
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

V21.1: **cada una de las 330 cajas de las estanterías es una malla individual**.
Se puede apuntar, agarrar y depositar por separado; desde V21.2 no se sueltan
en el piso.
Ver `individual-medications.md` y `v21.2-polish.md`.

### Pedido por color
El HUD muestra una **muestra de color sólida** y el nombre del color del
medicamento pedido. Cada color corresponde a un medicamento exacto y las
estanterías están agrupadas por color. Al entregar el pedido correcto, la
muestra cambia por la del siguiente cliente.

### Entrega por cinta
El jugador recoge la caja con la mira y la coloca en la cinta. La caja viaja por
el recorrido en L, sube la rampa y llega al mostrador. El empleado la recoge,
hace la animación de entrega y se la pasa al cliente. La validación ocurre al
final: se compara el **medicamento exacto**, no solo el color. Si no coincide,
no suma, la caja vuelve a su lugar y el cliente sigue esperando. Si coincide,
sube el puntaje y la fila avanza.

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
| `web/mobile/game.js` | mira, agarre/depósito por caja real, pedido por color, cinta, cola, menú, cuenta, animaciones |
| `web/mobile/platform.js` | detección de dispositivo y Head Tracking remoto |
| `web/v20/pharmacy-scene.js` | cajas individuales de color sólido, grupos por color, carteles, escala, cinta de máquina eliminada, API de cinta/imagen |
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

Resultados de la última ejecución local (V21.2): `test-v21` **19/19**,
`test-pad` **23/23**, `test-v20` **18/18**, `test-web` **31/31**,
`test-vr` **34/34**, `check-xcode` **164/164** y calibrador Windows **62/62**
(requiere `npm install`). Ver `testing-report.md` y `v21.2-polish.md`.

La compilación iOS de V21.1 dio **BUILD SUCCEEDED** en GitHub Actions (runs
45890568451 y 46041477056, Xcode 16.4). La corrección del pedido estable dejó
un IPA de **844.124 bytes**, SHA-256 `0AE2BF4B…42DEDC1`, verificado con
`verify-ipa.js`. La firma e instalación en iPhone siguen pendientes.

## 6. Documentos V21

- `conveyor-delivery.md` — recorrido, velocidad, validación y animaciones.
- `v21.2-polish.md` — depósito restringido, estanterías, colores, física e interfaz por dispositivo.
- `start-menu.md` — menú, cuenta regresiva y congelación del reloj.
- `aim-and-queue.md` — mira, contorno, pedido por imagen y fila.
- `individual-medications.md` — cajas individuales, agarre/soltura y mandos.
- `testing-report.md` — pruebas y evidencias.
- `limitations.md` — lo que no se validó en hardware real.
