# V21 · Entrega por cinta transportadora

## 1. Recorrido

La cinta principal del HTML es un recorrido en L:

```
entrada (40.4, 7.1)
   │  sube por Z
   ▼
(40.4, 12.25) ─ giro ─ (39.1, 12.7)
                         │  avanza por X
                         ▼
                    (28.2, 12.7)
                         │  rampa
                         ▼
                    (25.35, 12.7)  ← recepción del mostrador
```

- La superficie arranca a `BTOP + 0.02` (1,02).
- La altura final es 2,10 para apoyar la caja en la rampa del mostrador.
- La caja se dibuja con su centro a `y_superficie + 0.48` (media caja), así queda
  apoyada y no atraviesa la lona.
- La orientación sigue la tangente del tramo (`rotation.y`).
- Longitud total medida: **20,28 unidades**.

## 2. Colocación

- El jugador debe estar a menos de **3,4 unidades** de la entrada
  (`conveyor.entry`).
- El HUD muestra **COLOCAR** cuando corresponde.
- Se usa la acción de interacción existente (E, A/R1/R2 o botón táctil).
- Si la cinta ya tiene un paquete a menos de `beltSpacing × 1.2`, se rechaza
  con “La cinta está ocupada”. No se crean objetos de más.

## 3. Movimiento y separación

- `CFG.beltSpeed` por defecto: **3,6 unidades/s**. Configurable por API
  (`RasmaticGame._test.config({ beltSpeed })` en pruebas).
- Cada paquete guarda su distancia `s` sobre la polilínea.
- Se actualizan de adelante hacia atrás y se limita
  `s <= s_del_paquete_de_adelante - beltSpacing`.
- `CFG.beltSpacing` por defecto: **1,5 unidades**.
- La textura de la cinta se desplaza con la misma velocidad efectiva; cuando no
  hay paquetes, `setSpeed(0)` detiene la superficie.
- Hay 4 mallas de paquete en un pool; si las 4 están ocupadas, no se acepta otro.

## 4. Recepción y entrega

1. El paquete llega al final (`s >= total`).
2. Si hay cliente activo y el empleado está libre, comienza `pickup`.
3. El empleado levanta la caja desde la cinta hasta su mano
   (0,55 s, con arco).
4. `handoff`: lleva la caja hasta el cliente (0,7 s).
5. Se valida el color contra el pedido del cliente activo.
6. El paquete se oculta y vuelve al pool.
7. El empleado vuelve a su pose de espera (0,45 s).

### Validación

- **Correcto:** `scoreP++`, se oculta el pedido, el cliente pasa a `receiving`,
  se espera ~1 s, se retira, la fila avanza y se repone un cliente.
- **Incorrecto:** `stockP[color]++`, se actualiza el stock, el pedido no cambia,
  el cliente hace un gesto de negación y sigue esperando. No hay puntos.
- No existe un camino alternativo que valide sin pasar por la cinta: la única
  función que suma es `resolveBeltDelivery`, llamada por la animación del
  empleado.

## 5. Animación del empleado

El empleado es el farmacéutico del HTML (`AT`). Sus brazos son grupos
animables (`userData.p.al/ar`). En la entrega:

- `al` y `ar` suben hacia la cinta;
- el brazo derecho se extiende y gira hacia el cliente;
- la cabeza acompaña el movimiento;
- al terminar, vuelve a la pose idle.

## 6. Cinta de la máquina

La ventanilla de RASMATIC BOT conserva su mostrador y su cartel, pero se
eliminaron:

- la rampa inclinada de la ventanilla;
- la superficie larga de 4,6 unidades;
- los rieles laterales.

`pharmacy.machineConveyor === false` y la suite V21 lo comprueba. La máquina
sigue funcionando con su mástil, carro y pad para el CNC.

## 7. Parámetros y depuración

```js
RasmaticGame._test.config({
  beltSpeed: 3.6,
  beltSpacing: 1.5
});
RasmaticGame.debug().belt;
// { count, speed, total, entry, items:[{color,s}] }
```

Cada paquete guarda color, droga, malla y `s`. No se crean geometrías ni
materiales por fotograma: la geometría es compartida y los materiales salen del
caché `drugKit`.

## 8. Pruebas relacionadas

- V21-05: colocar y verificar que `s` avanza y la cinta tiene velocidad.
- V21-06: entrega validada y cambio de pedido.
- V21-08: color incorrecto no suma y vuelve al stock.
- V21-09: dos paquetes con separación ≥ 1,5.
- V20-09 y test-web T07/T09: integración con la partida.
