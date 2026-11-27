# V21 · Mira, contorno, pedido visual y fila de clientes

## 1. Mira

- Elemento `#v21-aim`, centrado con `position:fixed; left:50%; top:50%`.
- Dentro de `#rg-hud`, por lo que VR lo clona en cada ojo.
- Solo se muestra durante la partida (el menú/cuenta lo tapan con su fondo).
- No mueve al jugador ni cambia `PP.yaw`/`PP.pitch`.

## 2. Raycasting

Cada ~100 ms, solo en `place` y `playing`:

```
origen  = cámara del juego
dirección = (0,0,-1) aplicada a:
             RasmaticVR.aimQuaternion()  (VR activo, incluye Head Tracking)
             o camera.quaternion          (fuera de VR)
```

- `Raycaster.far = CFG.aimRange` (16).
- Objetos: **todas las cajas visibles de las estanterías** (`pharmacy.shelfBoxes`),
  no solo las seis de estación. Cada caja es una malla individual.
- Se excluyen las cajas que están en la mano, en la cinta o ya entregadas.
- Se toma el **primer impacto**: ese medicamento es el objetivo, sin etiquetas
  intermedias ni selección por proximidad.
- La distancia de interacción es `CFG.aimTake` (5,6). El contorno puede verse a
  más distancia, pero RECOGER solo aparece si el jugador está cerca.

V21.1: al agarrar se usa la malla real. Desde V21.2 el medicamento no se
suelta en el piso: permanece en la mano hasta depositarlo en la cinta. Ver
`individual-medications.md` y `v21.2-polish.md`.

### Contorno

Un grupo reutilizable con:

- una carcasa `BackSide` escala 1,08, amarilla y semitransparente;
- `LineSegments` de `EdgesGeometry` con las aristas.

Se posiciona con la matriz mundial de la caja (`getWorldPosition` /
`getWorldQuaternion`). No se crea geometría por selección. Al perder el objetivo
se oculta; al cambiar de caja se traslada.

### Sin etiquetas

Se eliminaron los carteles `makeTag` de las estaciones y del cliente. Queda
únicamente el cartel del kiosco BOT·CNC. `debug().stationLabels === 0` y la suite
lo comprueba.

## 3. Pedido por imagen

- El HUD `#rg-req` contiene `#rg-req-img`.
- `pharmacy.drugImage(drugIndex)` devuelve un `data:image/png` generado desde la
- V21.2: el pedido muestra una muestra de color sólida y su nombre; la
  miniatura se genera con el color exacto del medicamento.
- No hay imágenes genéricas: es el arte real del medicamento solicitado.
- El nombre no aparece como texto principal; solo queda el rótulo “PEDIDO”.
- Al cambiar el cliente activo, se actualiza el `src` y se reproduce una
  animación suave (`v21-req-pop`).

## 4. Fila

Posiciones (`QUEUE`):

| Slot | x | z |
|---|---|---|
| 0 | 21.9 | 15.5 |
| 1 | 24.4 | 16.9 |
| 2 | 26.9 | 18.3 |

- Entrada de clientes: `(28.5, 21.0)`, salida `(24.5, 21.0)`.
- Hay un pool de 6 personajes; como máximo se ven 3 en cola (+ 1 saliendo).
- Los tres primeros aparecen en su slot (con pop) a los 0.2 / 1.0 / 1.8 s.
- Los clientes de reposición caminan desde la entrada al último slot.
- Cada cliente guarda `request`, `slot`, `state` y animaciones.
- Al atenderse el frente: `releaseFront()` lo saca de la cola, lo pasa a
  `leaving`, reasigna slots, actualiza `requestP` y programa la reposición.
- `pickClientColor()` evita repetir el pedido de otro cliente de la cola cuando
  hay stock suficiente.

### Animaciones

- `waiting`: brazos y cabeza con oscilación suave, respiración.
- `walking`/`leaving`: piernas y brazos alternados, bob, giro hacia el destino.
- `receiving`: brazos arriba, pequeña reacción de 1,2 s.
- `badAt`: negación con la cabeza cuando el medicamento es incorrecto.

## 5. Personajes

- `makePerson` del HTML (toon + contorno).
- Empleado: escala 0.86 (≈4,0 unidades de alto).
- Clientes: escala 0.82 / 0.84 / 0.86.
- El ojo del jugador está a 3,6; la proporción es humana y no de miniatura.
- Brazos y piernas son grupos animables; la cabeza está en `userData.H`.

## 6. Pruebas

- V21-03: tres clientes en slots y pedido con imagen.
- V21-04: mira, contorno, desaparición al mirar afuera, sin etiquetas.
- V21-07: avance de fila y reposición.
- V21-10: escala de personajes, cartel y cajas de color.
- V21-11/12: mira y cuenta regresiva en VR.
- V21-14/15/16: cajas individuales, soltar/volver a agarrar y validación
  por medicamento exacto.
