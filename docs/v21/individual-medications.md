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
| `userData.dropped` | fue soltada en el piso |
| `userData.onBelt` | está en la cinta |
| `userData.consumed` | ya fue entregada |

No se usa `InstancedMesh` ni geometría fusionada. Se comparte una única
geometría atlas y un material por medicamento para que cada caja siga siendo
una llamada de dibujo independiente sin multiplicar materiales.

## 2. Seleccionar, agarrar, soltar y volver a agarrar

1. La mira central lanza un rayo cada 100 ms.
2. El rayo considera **todas** las cajas visibles de las estanterías, no solo
   las seis de las estaciones.
3. La primera caja impactada se rodea con el contorno amarillo. El HUD muestra
   el nombre exacto del medicamento (`Medicamento: AMOXICILINA`).
4. `RECOGER` (A / R1 / R2 / toque) toma **esa malla concreta** y la sujeta
   delante de la cámara. La caja real deja la estantería; no se cambia por un
   cubo genérico.
5. Lejos de la cinta, la misma acción muestra `SOLTAR`: deja la caja en el piso,
   delante del jugador.
6. La caja soltada sigue siendo apuntable y se puede volver a agarrar.
7. Cerca de la entrada de la cinta, la acción muestra `COLOCAR` y la caja real
   pasa al recorrido de la cinta. El pedido visible se congela con el que se
   colocó y no avanza hasta que la caja y el empleado terminan; si el mando
   repite el flanco, una ventana de 300 ms impide agarrar el siguiente
   medicamento.

En VR SBS la caja se parenta a la cámara del juego. El render estero desplaza
la cámara por ojo y la caja se dibuja correctamente en ambos ojos.

## 3. Validación por medicamento exacto

El pedido del cliente se sigue mostrando como imagen. Al final de la cinta:

- se compara `item.drug` con el medicamento canónico del color pedido;
- una caja de otra presentación **no suma**, aunque comparta categoría de color;
- si la caja pertenecía al stock de una estación, el stock se restaura y la
  caja vuelve a su lugar;
- si era una copia decorativa, vuelve a su lugar sin tocar el stock;
- al acertar, el puntaje sube y la fila avanza.

Las cajas de estación que todavía tienen stock vuelven a aparecer como una
unidad nueva; las copias individuales entregadas quedan consumidas hasta el
reinicio.

## 4. Controles

| Acción | Mando físico | Sin VR | VR Box |
|---|---|---|---|
| Moverse | stick izquierdo / cruceta | sí | sí |
| Correr | L1 o L2 | sí | sí |
| Apuntar | stick derecho | sí | sí |
| Seleccionar | mira central | sí | sí |
| Agarrar / colocar / soltar | A, R1 o R2 | sí | sí |
| Menú VR / ajustes | X | sí | sí |
| Recentrar Head Tracking | Y | sí | sí |
| Atrás / pausa | B o Start | sí | sí |

`RasmaticInput.press('interact')` es el único camino para las cuatro acciones
contextuales. El estado de la partida decide si significa iniciar, recoger,
colocar o soltar; por eso no hay conflicto entre el menú, la partida y la VR.

## 5. Verificación automatizada

| Caso | Qué comprueba |
|---|---|
| V21-14 | 330 mallas individuales, 330 identificadores únicos, sin fusión |
| V21-15 | agarrar una caja decorativa, soltarla en el piso y volver a agarrarla |
| V21-16 | entregar una copia individual del medicamento exacto pedido |
| P08b | A selecciona, agarra y suelta con el puente nativo del mando |
| P08c | lo mismo con el modo VR Box activo |

Resultados de la última ejecución local: `test-v21` **19/19**, `test-pad`
**23/23**. No sustituyen una prueba con iPhone, mando Bluetooth y VR Box
físicos; ver `limitations.md`.
