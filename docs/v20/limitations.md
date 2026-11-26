# V20 · Limitaciones y alcance real

Este documento separa lo **implementado y probado en simulación** de lo que
**solo puede validarse en hardware real**. No se debe presentar V20 como
“probada físicamente” hasta completar esa lista.

## 1. Compilación y firma

- **No hay macOS ni Xcode en este entorno.** No se ejecutó `xcodebuild`, no se
  creó un `.app` real y no se firmó nada.
- El `.ipa` de V20 **no se generó localmente**. El workflow
  `.github/workflows/ios-ipa.yml` está preparado para producirlo en macOS.
- El verificador `tools/verify-ipa.js` se probó con un `.ipa` **sintético**
  (Mach-O de prueba + `www/` real). Eso valida estructura y contenido, no la
  compilación de Swift ni la firma.
- `check-xcode.js` revisa el proyecto, el plist, los permisos y los espejos,
  pero no sustituye a Xcode.

## 2. Sensores y Head Tracking

- El código nativo usa `CMMotionManager` / `CMDeviceMotion` a 1/60 s y expone
  yaw, pitch y roll. **No se ejecutó en un iPhone físico.**
- En el navegador de pruebas no hay eventos de movimiento: las suites
  comprueban configuración, persistencia, apagado/encendido, recentrado y que
  el Head Tracking **no mueve al personaje**, pero no la calidad real de
  seguimiento.
- No se probó la latencia, el ruido del giroscopio, la deriva (drift) ni el
  comportamiento al girar 360°.
- No se probó la detección real de “sensor no disponible”.
- No se usa cámara ni ARKit, por decisión de diseño.
- El recentrado y la calibración se validan por API; la sensación física de
  “mirar al frente” queda pendiente.

## 3. iPhone, pantalla y VR Box

- No se instaló la app en un iPhone.
- No se probaron safe areas reales (notch/isla), brillo, reflejos ni
  calibración de color del panel.
- No se probó una VR Box física ni la separación interpupilar de una persona.
- El render SBS, IPD, convergencia, distorsión, zoom y HUD por ojo se verifican
  por píxeles y geometría en Chromium; no por percepción binocular real.
- El rendimiento se midió con SwiftShader (software), no con la GPU de un
  iPhone. No hay una cifra de FPS real.

## 4. Mando Bluetooth

- La suite inyecta un mando nativo simulado y un mando Gamepad API falso.
- Se comprueba el mapeo, la desconexión, que el joystick táctil apagado no
  anule el mando y que no se dupliquen entradas.
- **No se probó un mando Bluetooth físico** (Xbox, DualSense, etc.) ni el
  emparejamiento real de iOS.

## 5. Enlace Windows-iPhone

- El protocolo, la validación, el `rev`, el `ack`, el bloqueo, el modo Expo y la
  persistencia se prueban con `node --test` y con la API del juego.
- **No se probó una PC y un iPhone físicos en la misma Wi-Fi.**
- No se probó la reconexión tras perder la red real, ni un router con
  aislamiento de clientes, ni un firewall corporativo.
- El “estado de conexión” se cubre por lógica y UI; la latencia real de la LAN
  no se midió.

## 6. Fidelidad al HTML

- Se trasladaron geometrías, materiales, texturas canvas, luces, colores,
  personajes, estanterías, cinta, mostrador y máquina RASMATIC BOT del HTML.
- Las **330 cajas decorativas** se fusionaron por material para bajar de 1.734
  a 521 draw calls. Visualmente se conservan, pero dejan de ser objetos
  independientes; las **6 cajas interactivas** siguen separadas.
- Se eligieron seis cajas de estantería en posiciones horizontales distintas
  para que el radio de recogida no confunda dos cajas apiladas. Esto no cambia
  el aspecto del escenario, solo qué caja se usa como estación.
- El HUD del HTML (carrera, orden, mini-mapa, pasos) **no** reemplaza al HUD de
  RASMATIC: se conserva el HUD V18/V19 con personalización y SBS.
- Las reglas de “carrera a 5 pedidos” del HTML están documentadas en
  `rea-mechanics.md` y `rea-game-modes.md`, pero **no** se activaron: V20
  conserva las reglas de partida de 3 minutos de RASMATIC.
- No se sustituyeron texturas originales por genéricas. Todas las texturas del
  HTML son procedurales (canvas) y se reutilizan; no había imágenes base64.

## 7. Funciones que siguen sin validación física

| Función | Estado |
|---|---|
| Compilar y firmar la app | pendiente de macOS/Xcode |
| Instalar en iPhone | pendiente |
| Core Motion real | pendiente |
| Mando Bluetooth real | pendiente |
| VR Box real | pendiente |
| Wi-Fi PC ↔ iPhone real | pendiente |
| FPS en GPU de iPhone | pendiente |
| Batería y calor | pendiente |
| Permisos de movimiento en iOS real | pendiente |

## 8. Qué sí está cubierto

- Una sola app y un solo target/bundle.
- Escena de farmacia extraída del HTML, con inventario REA y evidencia.
- Sin restos del escenario anterior (mapa, góndolas, productos, logo).
- Tres modos, tres dificultades, inicio/fin, puntaje, cliente, bot y CNC.
- Joystick opcional y entrada externa independiente.
- Head Tracking configurable, persistente, con control local y puente Windows.
- SBS, IPD, convergencia, distorsión y HUD por ojo.
- 132 comprobaciones de estructura, 30 de juego, 18 de V20, 34 de VR, 21 de
  mando y 62 del calibrador Windows.

## 9. Recomendación antes de publicar

1. Compilar en macOS con el workflow y revisar los logs de `xcodebuild`.
2. Instalar en un iPhone y confirmar `NSMotionUsageDescription`.
3. Probar Head Tracking con el teléfono quieto, giros lentos y giros rápidos.
4. Probar el mando Bluetooth con el joystick táctil apagado.
5. Medir FPS con el escenario completo y VR activo.
6. Probar la VR Box con dos personas distintas (IPD).
7. Probar Windows ↔ iPhone en la Wi-Fi objetivo, incluida la desconexión.
8. Solo entonces integrar `v20` en `main` y publicar como V20 terminada.
