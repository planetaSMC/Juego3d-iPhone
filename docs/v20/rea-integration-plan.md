# REA · Plan de integración V20

## 1. Decisión de arquitectura

Se conserva el núcleo de juego de RASMATIC (`game.js`, HUD V18, joystick,
mando, VR, Head Tracking) y se reemplaza **solo la escena 3D** por la farmacia
del HTML. La escena se extrae a un módulo propio para no mezclarla con la
lógica de partida.

```
web/
├── index.html                  shell V20 + HUD + carga de scripts
├── v20/pharmacy-scene.js       escena HTML adaptada (geometría/materiales)
├── v20/pharmacy-scene.css      estilos propios de la escena (si hacen falta)
├── mobile/game.js              mecánicas RASMATIC (adaptadas)
├── mobile/android-bridge.js    joystick/mando/pausa (se conserva)
├── mobile/android-game.css     HUD V18 (se conserva)
├── vr/vr-preview.js            SBS/IPD/convergencia (se conserva)
├── headtracking/head-tracking.js Core Motion + fallback (se conserva)
├── net/vr-link.js              enlace Windows (se amplía)
└── ios/ios-bridge.js           GameController (se conserva)
```

## 2. Contrato entre escena y juego

`pharmacy-scene.js` expone `window.RasmaticPharmacy`:

```js
{
  scene, camera, renderer,
  playerStart: { x, z, yaw, pitch },
  eye: 3.6,
  blocked(x, z),
  drugs, colors, shelves, shelfBoxes, machineBoxes,
  machine: { root, mast, car, pad, boxes, spec, home, api },
  counter: { x, z, npc, customer, bot, kiosk },
  mats,
  makePerson(shirt, hair, skin, variant, opts),
  makeDrugMats(drug),
  update(dt),
  filmPath,
  modelTarget,
  setLogo(on)
}
```

`game.js` usa ese contrato en lugar de construir la escena del almacén.

## 3. Adaptaciones concretas

### 3.1 Estaciones

- 6 cajas de medicamento de las estanterías HTML (una por color/pedido).
- `STATIONS` se llena con `pharmacy.stations`.
- El cartel de cada estación usa el nombre del medicamento y el stock.
- Al recoger, la caja se oculta; al reponer, se vuelve a mostrar.

### 3.2 Mostrador y personajes

- `SPOT.counter` pasa al mostrador HTML (`DX=21.9, DZ=12.7`).
- `SPOT.npc` usa el farmacéutico `AT`.
- `SPOT.customer` usa un cliente toon en el mostrador.
- `SPOT.bot` usa la ventanilla del bot (`14, 18.2`).
- `SPOT.kiosk` usa la máquina RASMATIC BOT.

### 3.3 CNC

- `G.machine.root = M`, `mast`, `car`, `pad`, `boxes = MB`.
- `G.home` se expresa en coordenadas locales de la máquina:
  `x=HX`, `y=HY`, `zm=ZM`, `ret=1.6`, `ext=0.6`, `floor=0`, `pxOff=0`.
- `G.spec` se construye con las cajas `MB` (columna/nivel).
- `setMast/setCar/setPad` mueven las piezas HTML.
- `applyCnc` posiciona la caja localmente, no en coordenadas de mundo.

### 3.4 Colisiones y movimiento

- `blocked(x,z)` del HTML reemplaza al del almacén.
- `PP` arranca en `(46.8, 9.4)` con yaw π/2 y pitch -0.05.
- `EYE = 3.6`.
- Se conservan los controles de V19 (teclado, joystick, mando, táctil).

### 3.5 Modos

- `film`: recorrido por la farmacia con `filmPath`.
- `model`: órbita de la máquina RASMATIC BOT.
- `place`: primera persona + partida V19.

### 3.6 Render y SBS

- `renderer.render` sigue siendo el del core; `vr-preview.js` lo envuelve.
- El head tracking se aplica igual que en V19.
- No se toca `PP.yaw/pitch` desde VR/HT.

## 4. Rendimiento

El HTML tiene 1.734 draw calls y 78.784 triángulos en el menú. Para iPhone:

1. Fusionar la geometría estática de estanterías, marcos y paredes.
2. Reducir las 330 cajas decorativas a las 6 interactivas + un subconjunto
   visual fusionado.
3. Limitar clientes/bots simultáneos a 3–5.
4. No activar sombras (el HTML no las usa).
5. Mantener `setPixelRatio` ≤2; en VR SBS usar el mismo camino que V19.
6. Medir `renderer.info` y FPS en Chromium; documentar que la validación real
   en iPhone queda pendiente.

## 5. Fases

1. Documentación REA (esta carpeta).
2. Módulo `pharmacy-scene.js` y prueba aislada en Chromium.
3. Shell `index.html` V20 con modos `film/model/place`.
4. Adaptación de `game.js` (posiciones, estaciones, CNC, personajes).
5. App única `RASMATIC VR` (`com.rasmatic.lugar3d`).
6. Configuración Windows de Head Tracking.
7. Pruebas: escena, colisiones, tres modos, dificultades, joystick, mando,
   head tracking, SBS, V18, rendimiento.
8. Documentación final y artefactos.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| 1.734 draw calls | merge/instancing selectivo |
| Coordenadas HTML vs RASMATIC | contrato `pharmacy` + `G.home` local |
| CNC HTML vs lógica V19 | adaptador `machine.api` |
| Personajes HTML vs tags V19 | wrapper `makePerson` + tags |
| Fuentes/CDN | three y fuentes locales |
| VR SBS duplicando escena pesada | medir; reducir cajas/clientes |
| Head Tracking en escena nueva | mismo wrapper de render |
| Windows sin conexión | configuración local persistente |

## 7. Criterio de aceptación

- Una sola app iOS `RASMATIC VR`, bundle `com.rasmatic.lugar3d`.
- La escena del HTML es reconocible: piso, paredes, cartel, estanterías,
  cajas, cinta, mostrador, máquina y personajes.
- No quedan estanterías/productos del almacén anterior.
- Los tres modos y las tres dificultades funcionan.
- Joystick opcional y mando Bluetooth funcionan.
- Head Tracking se activa/desactiva desde Windows y desde el iPhone.
- SBS, IPD, convergencia e intensidad 3D se mantienen.
- Pruebas automatizadas verdes; limitaciones físicas documentadas.
