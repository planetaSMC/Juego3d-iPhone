# REA · Mecánicas del HTML de referencia

## 1. Movimiento del jugador

- Posición inicial: `(46.8, 9.4)`, yaw `π/2`, pitch `-0.05`, ojo `3.6`.
- Velocidad base: `8 u/s`; `Shift` multiplica por 2.
- Giro con flechas: `1.9 rad/s`.
- Cámara por arrastre: `yaw -= dx*0.005`, `pitch -= dy*0.004`,
  `pitch ∈ [-1.4, 1.4]`.
- Movimiento relativo al yaw:
  - `nx = x + (-sin(yaw)*fwd + cos(yaw)*str)*speed*dt`
  - `nz = z + (-cos(yaw)*fwd - sin(yaw)*str)*speed*dt`
- Se prueba `blocked(nx, z)` y `blocked(x, nz)` por separado: permite deslizar.
- `bobY = sin(bobTime*10)*0.055` mientras se mueve.
- Cámara final: `rotation.set(pitch, yaw, 0, 'YXZ')`.

## 2. Colisiones

`blocked(x,z)` es la única autoridad. Devuelve `true` si:

- Fuera de la sala (`x<0.8 || x>53.8 || z<0.8 || z>30.4`).
- Dentro de un rectángulo de `DECO` (estanterías decorativas).
- Cinta vertical/horizontal.
- Máquina RASMATIC BOT.
- Círculo del mostrador.
- Ventanilla del bot.
- Círculo de 2.1 alrededor de tres puntos de cada estantería principal.

No hay gravedad, salto, rampas ni colisión vertical. El jugador no puede subir
a las estanterías ni atravesar la cinta.

## 3. Interacción

- Raycast desde el centro de la cámara (`NDC 0,0`).
- Objetivos: cajas de estantería (`SB`) y cajas de la máquina (`MB`).
- Distancia máxima: 12.
- Una caja es válida si:
  - No es la que se lleva.
  - Es de la máquina y está visible/dentro de `M`.
  - Es de estantería y está en `scene` y a menos de `0.01²` de su `home`.
- `E`:
  - Sin caja: agarra la caja apuntada; la cuelga de la cámara
    (`position (1,-0.9,-2.6)`, escala 1.4 o 1.75 si es de máquina).
  - Con caja y cerca de la cinta: entrega. Si el color/drug coincide con el
    pedido, suma; si no, devuelve y penaliza.
  - Con caja y lejos de la cinta: la devuelve al estante.
- `H`: pista, suma 4 s al tiempo y hace brillar el estante correcto.
- `Enter` en menú/end: empieza/reinicia.

## 4. Pedidos y clientes

- `GOAL = 5` pedidos.
- `pOrd` se baraja sin repetir consecutivo.
- Hasta 3 clientes activos; aparecen cada `1.4 s`.
- Cada cliente tiene:
  - `st`: `wait | q | serve | leave | gone`.
  - `slot`: 0..2, posición `SLOT`.
  - `md`: humor 0..3 según espera (`<12 s`, `<22 s`, `<32 s`, resto).
  - `tip`: propina calculada al entregar.
  - `box`: caja que recibe.
- El cliente camina desde `(27.3, 30.4)` hasta su slot; al recibir, se va.
- Burbuja de diálogo dibujada en canvas: pide el medicamento o agradece/niega.

## 5. Cinta transportadora

- Dos tramos en L:
  - `(40.4, 7.1)` a lo largo de Z, 13.6.
  - `(33.6, 12.7)` a lo largo de X, 11.2.
- La caja entregada se coloca en `(40.4, BTOP+0.55, 7.5)`.
- `stepWorld` mueve la caja:
  - Primero por la cinta vertical hasta `z=12.7`.
  - Luego por la horizontal hasta `x=DX`.
  - La altura sube con una rampa (`u = (28-x)/2.6`).
  - Al llegar al mostrador, el cliente la recibe y se va.
- `BTOP = 1.0`; la textura de la cinta se desplaza según `BS=3.4`.

## 6. Máquina RASMATIC BOT

- `M` en `(12.4, 0, 9.3)`, rotación π/2.
- 5 niveles `SY = [1.05, 3, 4.95, 6.9, 8.85]`, 6 columnas por nivel.
- 30 cajas `MB`, una por celda, con textura de medicamento.
- `mTarget()` elige una caja visible al azar.
- `mUpdate(dt)`:
  - `m.t += dt * DIF * (pDone>mDone ? 1.3 : 1)`.
  - El mástil se mueve de `HX` a `tx = -2.4 + k*1.2`.
  - El carro sube a `SY[lv]+0.5`.
  - El pad se extiende/retrae (`pz` de 1.6 a 0.6).
  - La caja sigue al pad entre `t=3.2` y `t=7.7`.
  - En `t>=7.7` la caja desaparece y `mDone++`.
  - Si `t>=m.T` sin completar, la caja vuelve a su home y se elige otra.
- `DIF`: Fácil `0.55`, Normal `1.9`, Difícil `2.7`.
- Si el jugador va ganando (`pDone>mDone`), la máquina acelera un 30 %.

## 7. Puntuación y fin

- Acierto: `100 + max(0, round(60 - (t-lastT)*3)) + streak*20`.
- Error: `+5 s` y `-50 puntos` (mínimo 0).
- Pista: `+4 s`.
- `streak` se reinicia con un error.
- `pDone >= 5` → `state='finish'`; espera a que el último cliente se vaya.
- `mDone >= 5` → `end(false)` (gana la máquina).
- Al ganar: estrellas según tiempo (`<50 s` 3, `<75 s` 2, resto 1).
- Mejor tiempo en `localStorage['rasmatic-pharma-best']`.

## 8. Dificultad

Tres botones en el panel inicial:

| Botón | `DIF` | Efecto |
|---|---|---|
| 😌 Fácil | 0.55 | La máquina tarda mucho más |
| 🙂 Normal | 1.9 | Ritmo base |
| 😈 Difícil | 2.7 | La máquina acelera |

No cambian las reglas del jugador ni la puntuación; solo la velocidad de la
máquina.

## 9. Diferencia frente a las reglas RASMATIC V19

El HTML es una **carrera a 5 pedidos** con clientes y cinta. RASMATIC V19 es
una **partida de 3 minutos** con 6 estaciones, pedidos por color y un bot que
usa el CNC. V20 conserva las reglas de V19 y traslada del HTML:

- La geometría y materiales de la farmacia.
- Las estanterías y cajas de medicamentos.
- La cinta en L y su animación.
- La máquina RASMATIC BOT y sus 30 cajas.
- Los clientes toon, el mostrador y la ventanilla.
- La iluminación, carteles y decoración.
- Las colisiones del HTML.

La carrera de 5 pedidos y su puntuación se documentan como referencia, pero
**no sustituyen** las reglas de la partida RASMATIC. La dificultad de V19
(Fácil/Normal/Difícil) se mantiene y se mapea a los tiempos del bot; los
valores `DIF` del HTML se usan para la velocidad visual de la máquina.
