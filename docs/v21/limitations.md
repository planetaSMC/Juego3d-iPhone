# V21 · Limitaciones y alcance real

V21 está implementada y probada en simulación. No se probó en un iPhone físico.

## 1. Hardware y compilación

- No hay macOS/Xcode en el equipo local.
- La rama V21 es un cambio de web/JS/CSS; el target Swift y el bundle siguen
  siendo los de V20.1 (`com.rasmatic.lugar3d`, esquema `RasmaticVR`).
- **Sí se compiló V21 en GitHub Actions** (runs 45880086744 y 45880239776,
  Xcode 16.4): `BUILD SUCCEEDED`, IPA de 840.012 bytes. Hashes observados:
  `4287E5FE…533588` y `66714AB0…94F05` (varían por timestamps), verificados con
  `verify-ipa.js`.
- No se instaló ni firmó la app.

## 2. Sensores y VR

- Core Motion real (giroscopio, deriva, latencia) no se probó en un iPhone.
- No se probó Head Tracking físico con la mira; solo se verificó que
  `aimQuaternion` incluye el offset cuando VR está activo.
- No se probó una VR Box física ni la percepción binocular del contorno.
- El SBS, IPD y convergencia se verifican por geometría/píxeles, no por visión
  humana.
- La mira en VR se clona por ojo y usa la cámara real; la alineación exacta
  respecto de la lente física queda pendiente.

## 3. Personajes y animaciones

- La escala se verificó numéricamente (empleado 0,86; clientes 0,82–0,86) y en
  capturas de Chromium, no en una pantalla de iPhone.
- Las animaciones son procedurales (grupos de brazos/piernas); no hay captura de
  movimiento ni skinning.
- Las reacciones de cliente son gestos simples; no hay diálogo hablado.
- Los clientes no colisionan físicamente con el jugador; la fila evita que se
  superpongan entre ellos, pero el jugador puede atravesar a un cliente.

## 4. Cinta

- La velocidad y separación están probadas por API y por simulación.
- No se probó en un iPhone la suavidad a 60 fps ni el comportamiento al cambiar
  de orientación.
- La caja se mantiene horizontal sobre la rampa; en la rampa corta puede quedar
  una diferencia visual mínima de apoyo.
- Si el jugador coloca cajas muy rápido, la entrada rechaza hasta que haya
  separación; no se apilan.

## 5. Rendimiento

- 681 draw calls / 72.330 triángulos / 1.041 mallas con 3 clientes, medido con
  SwiftShader.
- No hay FPS reales de iPhone.
- En VR SBS se renderiza dos veces; el presupuesto de GPU real queda por medir.

## 6. Red y Windows

- El enlace Windows-iPhone se mantiene de V20.1; no se modificó.
- No se probó con una PC y un iPhone físicos.
- La configuración de Head Tracking sigue funcionando por el protocolo
  `rev`/`ack` de V20.1.
- El instalador NSIS del calibrador **sí compiló** en GitHub Actions (run
  45884702784): 62/62 pruebas, 82.022.901 bytes, SHA-256
  `053C84A4C908C4AA26F805DAC2DC7BD0D8C850DBA12BA88C4E3619A28049946F`.
- No se ejecutó la instalación real del `.exe` en esta máquina.

## 7. Qué sí está cubierto

- Menú/cuenta regresiva y reloj congelado.
- Mira con raycast, contorno, desaparición y sin etiquetas.
- Pedido por imagen real del medicamento.
- Cinta funcional con recorrido, validación, separación y animación del empleado.
- Fila de tres clientes, avance y reposición.
- Escenario V21: cartel, cajas de color, escala, cinta de máquina eliminada.
- VR: mira y cuenta por ojo, Head Tracking en la orientación.
- Todas las suites V20.1 adaptadas y verdes.

## 8. Recomendación antes de publicar

1. Revisar el IPA ya compilado en Actions (Xcode 16.4) y firmarlo.
2. Instalar en un iPhone y probar el menú, la cuenta y el HUD con notch.
3. Probar la mira y el contorno desde la distancia real de juego.
4. Probar la cinta con 2–3 paquetes y un mando Bluetooth.
5. Probar VR Box, IPD y Head Tracking con la mira.
6. Medir FPS reales en el iPhone con la fila llena.
7. Solo entonces integrar `v21-gameplay-animation` en `main`.
