# REA · Arquitectura del HTML de referencia

## Identidad analizada

| Dato | Valor |
|---|---|
| Archivo | `RASMATIC_Farmacia_3D_mejorada (2).html` |
| Tamaño | 57.921 bytes |
| Líneas | 904 |
| SHA-256 | `773B921A01751118C732932FEBEF1C27C7DA070B9E4C640E98D0C1524D86D57E` |
| Script inline extraído | 49.745 bytes · SHA-256 `19913B6258F5918913B9BA96FE38F8CF54568EA532C1292BAFB5BC4BA8BE1795` |
| Motor | Three.js **r128** |
| Formato | HTML único, CSS y JavaScript inline, sin build step |

### Evidencia REA

- Análisis estático: `analyze_javascript_application` sobre el directorio extraído.
  - Evidence: `ev_0f2bf10ad93e66a6d120304271dcd5b373b2b39ff4229e7ff55b464b4b9e281a`
  - Evidence padre: `ev_e772a1d869e1dba8976e15a9b86cdc311a9f1d36c2298dedea2145c36b46467b`
  - Digest del artefacto: `cd9cb88d24b82e671013a49c7c2ba8bc79c971ee68e15d6d96493ab000d68c4b`
  - 14.756 nodos AST, 1.936 relaciones de call-flow, 5.858 de data-flow, 958 de closure.
  - Limitación REA: análisis estático inerte; no ejecuta el bootstrap ni el loop.
- Observación de runtime con Chromium headless + Three.js local:
  - `THREE.REVISION = "128"`
  - 728 mallas, 317 geometrías, 47 texturas, 13 luces, 26 grupos.
  - 1.734 draw calls y 78.784 triángulos en el menú (peor caso aproximado).
  - Captura: `docs/evidencias/v20/rea-html-runtime.png`.
  - Limitación: la captura se tomó con SwiftShader, no con GPU de iPhone.

## Arquitectura del documento

```
index.html
├── <style>  (todo el HUD y paneles)
├── DOM del HUD (order, race, mini, steps, prompt, panel, tpad...)
├── <script src=three.js/r128>  (CDN original)
└── <script>  (juego completo, IIFE implícita por 'use strict')
    ├── datos: DRUGS, CATS, CUST, SHIRTS, HAIRS
    ├── texturas de canvas: cajas, piso, pared, carteles, cinta
    ├── constructores: piso, paredes, techo, estanterías, decoración,
    │                  cinta, personas, mostrador, máquina, clientes
    ├── estado: menu | play | finish | end
    ├── lógica: mUpdate, botStep, stepWorld, interact, reset, start, end
    ├── HUD: hud, say, mini, guide, bub
    ├── controles: teclado, puntero, botones táctiles
    └── loop: requestAnimationFrame + R.render(scene, cam)
```

No hay módulos ES, imports, workers, WebAssembly, físicas externas ni red
aparte del CDN de Three.js y Google Fonts.

## Renderizado y escena

- `WebGLRenderer({ antialias: true })`.
- `setPixelRatio(Math.min(devicePixelRatio || 1, 2))`.
- `Scene.background = Color(0xbcd3c8)`.
- `Scene.fog = Fog(0xbcd3c8, 38, 105)`.
- `PerspectiveCamera(72, aspect, 0.1, 200)`.
- `resize()` ajusta tamaño y aspecto.
- Sin sombras: `castShadow`/`receiveShadow` no se usan.
- Sin postproceso: render directo.
- Sin `OrbitControls`, `GLTFLoader`, `RGBELoader`, `EffectComposer` ni física.

## Iluminación

- `HemisphereLight(0xf0fff8, 0x8fb8a0, 0.55)`.
- `DirectionalLight(0xfff0e0, 0.38)` en `(15,30,10)`.
- `DirectionalLight(0xe8f4ff, 0.14)` en `(-10,20,20)`.
- `PointLight` de techo en posiciones concretas (`0xffe8cc`, 0.42, 38).
- `PointLight` principal (`0xffe2c0`, 0.28, 70).
- `PointLight` sobre el mostrador (`0xfff2cc`, 0.5, 8) ×3.
- Total runtime: 13 luces.

## Materiales

- `MeshStandardMaterial` para piso, paredes, estanterías, mostrador, máquina.
- `MeshBasicMaterial` para carteles, pantallas, LEDs, cruces y textos.
- `MeshToonMaterial` + `DataTexture` de 3×1 (`LuminanceFormat`) para las
  personas, con contorno `BackSide` (`OUTM`).
- `CanvasTexture` para todas las texturas pintadas a mano.
- `SpriteMaterial` para burbujas de diálogo de clientes.
- No hay texturas externas ni imágenes base64: **0 data URIs**.

## Escala y distribución

- Habitación: 55 × 32 unidades, centro `(27.3, 15.6)`.
- Piso: `PlaneGeometry(54.6, 31.2)` en `(27.3, 0, 15.6)`.
- Paredes: 0.4 de espesor; techo a 14.
- Ojo del jugador: 3.6.
- Inicio: `PP = { x: 46.8, z: 9.4, yaw: ~π/2, pitch: -0.05 }`.
- Estanterías principales en U:
  - `(47, 3.2)` rotación 0.
  - `(52.3, 9.5)` rotación -90°.
  - `(47, 15.6)` rotación 180°.
- Mostrador de atención: `DX=21.9, DZ=12.7, DH=2.2`.
- Máquina RASMATIC BOT: `M.position=(12.4, 0, 9.3)`, rotación π/2,
  dimensiones 9.2 × 10.2 × 2.6.
- Cinta en L: `(40.4, 7.1)` 13.6 de largo y `(33.6, 12.7)` 11.2 de largo.
- Ventanilla del bot: `(14, 18.2)`.
- Clientes en `SLOT = [[DX,15.7],[DX,18.3],[DX,20.9]]`.

## Colisiones

No hay motor de física. `blocked(x,z)` combina:

- Límites de la sala: `x ∈ [0.8, 53.8]`, `z ∈ [0.8, 30.4]`.
- Rectángulos de estanterías decorativas (`DECO`).
- Cinta vertical: `x ∈ [39.2, 41.6]`, `z < 14`.
- Cinta horizontal: `z ∈ [11.3, 14.3]`, `x ∈ [17.2, 41.6]`.
- Máquina: `x ∈ [10.3, 14.9]`, `z ∈ [3.8, 14.8]`.
- Mostrador: círculo de radio 1.3 en `(DX, 10.3)`.
- Ventanilla: `x ∈ [12.6, 15.6]`, `z ∈ [14.4, 19.6]`.
- Estanterías principales: círculos de radio 2.1 alrededor de tres puntos por
  estantería, rotados según `q.a`.

El jugador es un punto; no hay radio de cápsula. El movimiento se prueba por
ejes separados (`nx` y `nz`) para deslizar sobre paredes.

## Entrada y bucle

- Teclado: `WASD`/flechas, `Shift`, `E`, `H`, `Enter`.
- Puntero: arrastre sobre el canvas para yaw/pitch.
- Táctil: `#tpad` (flechas) y `#ebt` (E).
- `requestAnimationFrame`; `dt = min(0.05, delta)`.
- Cámara: `cam.position.set(PP.x, EYE+bobY, PP.z)`;
  `cam.rotation.set(PP.pitch, PP.yaw, 0, 'YXZ')`.
- En menú/end, la cámara gira lentamente alrededor del inicio.

## Audio

- `AudioContext` + osciladores (`triangle`/`sawtooth`), sin archivos.
- Efectos: `pick`, `ok`, `bad`, `win`, `lose`.

## Diferencias con el proyecto RASMATIC V19

| Tema | HTML | RASMATIC V19 |
|---|---|---|
| Escena | farmacia / mostrador / cinta / bot | almacén / pasillo / estaciones / CNC |
| Reglas | carrera a 5 pedidos | partida de 3 minutos, 6 medicamentos, bot |
| Dificultad | 3 botones que cambian `DIF` | 3 niveles que cambian intervalo/velocidad del bot |
| Personajes | toon procedurales | modelos simples procedurales |
| HUD | order/race/mini/steps | `#rg-*` V18 + V19 |
| Head Tracking | no existe | Core Motion + fallback web |
| VR SBS | no existe | capa `vr/` con IPD/convergencia |

La integración V20 conserva las reglas de RASMATIC y traslada la escena,
materiales, personajes y animaciones del HTML. Las reglas de carrera del HTML
se documentan en `rea-mechanics.md` y se usan como referencia para la cinta,
los clientes y la máquina, no como sustituto de las reglas actuales.
