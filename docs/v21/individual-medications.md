# V21.1 · Medicamentos individuales y controles

Esta revisión convierte **cada caja de medicamento de las estanterías en una
malla independiente**. Ya no hay cajas decorativas fusionadas en un solo
conjunto: las 330 cajas de `ph.shelfBoxes` son objetos `THREE.Mesh` separados,
con identidad propia y con las mismas posibilidades de interacción.

## 1. Modelo de datos

Cada caja creada por `stockRow` guarda:

| Campo | Uso |
|---|---|
| `userData.id` | índice único dentro de `shelfBoxes` (0…329) |
| `userData.n` | índice real del medicamento en `DRUGS` |
| `userData.home` | posición original en la estantería |
| `userData.q` | rotación original |
| `userData.kind` | `'shelf'` |
| `userData.taken` | fue retirada de su lugar |
| `userData.held` | está en la mano del jugador |
| `userData.dropped` | reservado para compatibilidad; el jugador ya no suelta en el piso |
| `userData.onBelt` | está en la cinta |
| `userData.consumed` | ya fue entregada |
| `userData.accessible` | `true` solo en las tres estanterías habilitadas |
| `userData.gc` | índice de color de juego (0…8) o `-1` si es decorativa |

No se usa `InstancedMesh` ni geometría fusionada. Se comparte una única
geometría de caja y un material de color sólido por medicamento. No hay atlas
ni texturas de producto: cada caja muestra un color limpio y uniforme.

## 2. Seleccionar, agarrar y depositar

1. La mira central lanza un rayo cada 100 ms.
2. El rayo considera las cajas visibles de las estanterías, pero **solo las
   tres primeras están habilitadas**. Las demás se marcan en rojo y no se
   pueden agarrar ni siquiera desde cerca.
3. La primera caja habilitada impactada se rodea con el contorno amarillo. El
   HUD muestra el medicamento y el color del pedido.
4. `RECOGER` (A / R1 / R2 / toque) toma **esa malla concreta** y la sujeta
   delante de la cámara con una transición de 220 ms. La caja real deja la
   estantería; no se cambia por un cubo genérico.
5. Mientras se lleva una caja no se puede agarrar otra.
6. Lejos de la cinta y de la vitrina, la acción no suelta nada. Cerca de su
   hueco, la acción muestra `GUARDAR` y la caja vuelve a la estantería con una
   animación corta. No existe `SOLTAR` libre en el piso.
7. Dentro de la zona de depósito, la acción muestra `COLOCAR`. La caja cae
   unos centímetros con gravedad, se apoya en la superficie de la cinta y
   comienza el recorrido. El HUD pasa al siguiente medicamento en el acto y el
   paquete conserva el cliente/pedido que le correspondía; si el mando repite
   el flanco, una ventana de 300 ms impide agarrar el siguiente medicamento.

En VR SBS la caja se parenta a la cámara del juego. El render estero desplaza
la cámara por ojo y la caja se dibuja correctamente en ambos ojos.

## 3. Validación por medicamento exacto

El pedido del cliente se muestra como muestra de color sólida. Al final de la
cinta:

- se compara `item.drug` con el medicamento canónico del pedido guardado en el
  paquete (`item.request`);
- una caja de otra presentación **no suma**, aunque comparta categoría de color;
- la caja se consume y **deja el hueco** en la estantería: no vuelve sola ni se
  duplica;
- si el medicamento era incorrecto, el mismo cliente vuelve a quedar pendiente
  y su pedido reaparece en el HUD;
- al acertar, el puntaje sube y el cliente se retira; la fila avanza.

## 4. Controles

| Acción | Mando físico | Sin VR | VR Box |
|---|---|---|---|
| Moverse | stick izquierdo / cruceta | sí | sí |
| Correr | L1 o L2 | sí | sí |
| Apuntar | stick derecho | sí | sí |
| Seleccionar | mira central | sí | sí |
| Agarrar / colocar | A, R1 o R2 | sí | sí |
| Menú VR / ajustes | X | sí | sí |
| Recentrar Head Tracking | Y | sí | sí |
| Atrás / pausa | B o Start | sí | sí |

`RasmaticInput.press('interact')` es el único camino para las cuatro acciones
contextuales. El estado de la partida decide si significa iniciar, recoger o
colocar; por eso no hay conflicto entre el menú, la partida y la VR.

## 5. Verificación automatizada

| Caso | Qué comprueba |
|---|---|
| V21-14 | 330 mallas individuales, 330 identificadores únicos, sin fusión |
| V21-15 | solo las 3 estanterías habilitadas; sin soltura libre; devolución y bloqueo |
| V21-16 | entregar una copia individual del medicamento exacto pedido |
| P08b | A selecciona, agarra, rechaza soltar en el piso y coloca en la cinta |
| P08c | lo mismo con el modo VR Box activo |

Resultados de la última ejecución local: `test-v21` **19/19**, `test-pad`
**23/23**. No sustituyen una prueba con iPhone, mando Bluetooth y VR Box
físicos; ver `limitations.md`.
