# REA · Modos de juego y dificultades

## 1. Lo que contiene el HTML

El HTML tiene **un único modo jugable**: una carrera contra la máquina.

- Objetivo: despachar 5 pedidos antes que `RASMATIC BOT`.
- Jugador: busca el medicamento en las estanterías, lo agarra con `E`, gira a
  la cinta y lo entrega con `E`.
- Máquina: elige cajas de su almacén y las despacha con el mástil.
- Cliente: espera en el mostrador; la caja viaja por la cinta.
- Fin: gana quien llega a 5; el jugador recibe estrellas y mejor tiempo.
- Dificultad: 3 botones (`DIF = 0.55 / 1.9 / 2.7`) que cambian solo la
  velocidad de la máquina.

No hay tres modos en el HTML. Los **tres modos** son una característica de
RASMATIC que V20 debe conservar.

## 2. Los tres modos de RASMATIC

La app actual expone tres experiencias:

| Modo | Nombre para el usuario | Qué hace |
|---|---|---|
| `film` | Recorrido guiado | cámara cinematográfica por la escena, con carteles |
| `model` | Modelo / exploración | cámara orbital alrededor de la máquina o vista libre |
| `place` | Lugar / partida | primera persona: caminar, mirar, interactuar y jugar |

El botón de modo y el menú de destinos permiten cambiar entre ellos. La
partida (`game.js`) vive dentro de `place`: el jugador se acerca al encargado
y pulsa JUGAR.

## 3. Mapeo V20

| Modo V20 | Escena | Controles | Reglas |
|---|---|---|---|
| **Recorrido guiado** | farmacia HTML, cámara por pasillos y mostrador | automático, se puede detener | sin puntaje |
| **Exploración libre** | farmacia HTML, primera persona | WASD/joystick/mando/head tracking | sin puntaje, colisiones HTML |
| **Partida RASMATIC** | farmacia HTML + estanterías/cinta/máquina | igual que V19 | 3 minutos, 6 medicamentos, pedidos, bot y CNC |

La partida conserva:

- Los 6 medicamentos/pedidos de color de V19.
- Las 6 estaciones de recogida, ahora sobre las cajas de las estanterías del
  HTML.
- El mostrador de entrega, ahora el mostrador de atención del HTML.
- El bot y el CNC, ahora la máquina RASMATIC BOT del HTML.
- Las 3 dificultades de V19 (Fácil/Normal/Difícil) con sus intervalos y
  velocidades.
- La partida de 3 minutos, puntaje, victoria/derrota y revancha.
- La personalización V18 del HUD.
- El joystick opcional y el mando Bluetooth.
- El head tracking y el render SBS.

## 4. Dificultades

Se mantienen las tres dificultades de V19:

| Nivel | Cliente cada | Velocidad del bot |
|---|---|---|
| Fácil | 12 s | 0.75× |
| Normal | 9 s | 1.0× |
| Difícil | 6 s | 1.25× |

La velocidad visual de la máquina puede usar los valores del HTML
(`0.55 / 1.9 / 2.7`) como multiplicador de animación, pero **no** cambia las
reglas de puntaje ni el reloj de 3 minutos.

## 5. Condiciones de victoria y derrota

Se conservan las de V19:

- La partida dura 3 minutos.
- Gana quien tenga más puntos al terminar.
- Empate si ambos tienen el mismo puntaje.
- El bot atiende clientes con el CNC y suma.
- El jugador recoge y entrega medicamentos.
- No hay condición de muerte; el resultado se muestra al final.

La carrera a 5 pedidos del HTML queda documentada como referencia y no se
activa en V20 para no cambiar las reglas actuales.

## 6. Pruebas por modo y dificultad

V20 debe probar:

- `film`: arranque, recorrido, parada, retorno a `place`.
- `model`: órbita, zoom, retorno.
- `place`: caminar, colisiones, cámara, estaciones, mostrador.
- Partida: inicio, 3 dificultades, recoger/entregar, errores, bot/CNC, fin,
  revancha.
- Joystick on/off y mando Bluetooth en los tres modos.
- Head Tracking en `place` y en VR SBS.
- Persistencia de dificultad y joystick.
