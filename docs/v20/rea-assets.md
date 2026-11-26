# REA · Inventario de recursos

## 1. Recursos externos

| Recurso | Uso | Decisión V20 |
|---|---|---|
| Three.js r128 (CDN) | motor 3D | reemplazar por `web/three.min.js` local (r128) |
| Google Fonts Orbitron + Exo 2 | HUD/carteles | reemplazar por las fuentes locales `web/fonts/font*.woff2` |
| Canvas 2D del navegador | todas las texturas | reutilizar |
| `AudioContext` | efectos | reutilizar |

No hay modelos `.glb/.gltf`, imágenes `.png/.jpg`, sonidos `.mp3/.ogg` ni
data URIs. **0 recursos base64**. Todo el arte es procedural.

## 2. Medicamentos (`DRUGS`)

15 medicamentos con nombre, colores, dosis y cantidad:

| # | Nombre | Dosis | Cantidad |
|---|---|---|---|
| 0 | Ibuprofeno | 400 mg | 20 comp. |
| 1 | Paracetamol | 500 mg | 20 comp. |
| 2 | Amoxicilina | 500 mg | 12 cáps. |
| 3 | Loratadina | 10 mg | 10 comp. |
| 4 | Omeprazol | 20 mg | 14 cáps. |
| 5 | Diclofenac | 50 mg | 20 comp. |
| 6 | Metformina | 850 mg | 30 comp. |
| 7 | Losartán | 50 mg | 30 comp. |
| 8 | Salbutamol | 100 mcg | 200 dosis |
| 9 | Aspirina | 500 mg | 20 comp. |
| 10 | Naproxeno | 550 mg | 20 comp. |
| 11 | Vitamina C | 1000 mg | 30 comp. |
| 12 | Vitamina D | 2000 UI | 60 cáps. |
| 13 | Zinc | 25 mg | 30 comp. |
| 14 | Calcio | 600 mg | 60 comp. |

Categorías de estantería:

- `Estante A`: `[0,1,9,10,5]`.
- `Estante B`: `[2,4,3,8]`.
- `Estante C`: `[7,6,11,12,13,14]`.

## 3. Texturas de canvas

| Textura | Dimensiones | Uso |
|---|---|---|
| `makeBoxFront(d)` | 512×320 | frente de caja de medicamento |
| `makeBoxSide(d)` | 256×320 | lateral de caja |
| `floorCanvas` | 256×256 | piso ajedrezado verde |
| `makeWallTex()` | 512×512 | pared con franja verde/azul |
| Letrero farmacia | 1024×180 | cartel superior |
| Cruces farmacia | 128×128 | cruz verde |
| `signMesh(t,w,col)` | 640×110 | carteles de estantería |
| `mkBeltTex()` | 64×64 | cinta transportadora |
| Panel de mostrador | 1024×256 | cartel ATENCIÓN |
| Cartel máquina | 512×128 | RASMATIC BOT |
| Burbujas de cliente | 320×150 | pedido / gracias / error |
| `TOON` | 3×1 | gradiente toon para personajes |

Todas se generan en runtime y se pueden reutilizar sin conversión. Para
iPhone conviene mantenerlas en canvas (no hay descarga) y controlar el número
de texturas (47 en runtime).

## 4. Geometrías y materiales

| Grupo | Geometrías | Materiales |
|---|---|---|
| Piso/paredes/techo | `PlaneGeometry`, `BoxGeometry` | `MeshStandardMaterial` con canvas |
| Estanterías | `BoxGeometry` reutilizada (`BOXG`) | estándar + `MeshBasicMaterial` LED |
| Cajas de medicamento | `BoxGeometry(1.15,.95,.5)` | array de 6 materiales (canvas + color) |
| Personas | `SphereGeometry`, `CylinderGeometry`, `LatheGeometry`, `TorusGeometry`, `BoxGeometry` | `MeshToonMaterial` + contorno `BackSide` |
| Máquina | `BoxGeometry` | `MeshStandardMaterial` + LED |
| Cinta | `BoxGeometry`, `PlaneGeometry` | estándar + textura repetida |
| Carteles | `PlaneGeometry` | `MeshBasicMaterial` con canvas |
| Burbujas | `Sprite` | `SpriteMaterial` |

## 5. Conteo de runtime

Medido en Chromium headless con SwiftShader, escena en menú:

| Métrica | Valor |
|---|---|
| Mallas | 728 |
| Geometrías | 317 |
| Texturas | 47 |
| Luces | 13 |
| Grupos | 26 |
| Draw calls | 1.734 |
| Triángulos | 78.784 |
| Cajas de estantería | 330 |
| Cajas de máquina | 30 |
| Estanterías principales | 3 |
| Decoraciones | 10 |

Después de `start()` se agregan clientes, bots y cajas de la cinta. El pico de
draw calls puede superar 2.000, por encima de lo recomendable para VR SBS en
iPhone. La integración V20 hizo:

- Mantener la fidelidad de materiales y texturas.
- Fusionar las cajas decorativas de las estanterías por material
  (`mergeShelfBoxes`), conservando las 6 cajas interactivas.
- Evitar sombras (el HTML no las usa).
- Mantener el pixel ratio en 1.5–2 y usar el `depth`/IPD existente.

Resultado medido en la app V20 (Chromium headless, SwiftShader):

| Métrica | HTML | V20 |
|---|---|---|
| Draw calls | 1.734 | **521** |
| Triángulos | 78.784 | 79.300 |
| Texturas | 47 | 46 |
| Mallas | 728 | 671 |

La fusión no cambia el aspecto: las cajas siguen en su sitio y con su
material/textura original; solo dejan de emitir una llamada por caja.

## 6. Personajes

- `makePerson(shirt, hair, skin, v, opts)`.
- 7 colores de camisa, 7 de pelo, 5 tonos de piel.
- Variantes: `coat`, `dress`, `old`, `white`.
- Partes animables: `p.l`, `p.r` (piernas), `p.al`, `p.ar` (brazos),
  `userData.H` (cabeza).
- El farmacéutico mayor `AT` agrega bigote, anteojos y moño.
- Los clientes usan `Sprite` de burbuja sobre la cabeza.

## 7. Reutilización directa

| Recurso | Acción |
|---|---|
| Geometrías y materiales | copiar/adaptar el código del HTML |
| Texturas canvas | copiar tal cual |
| Personajes toon | copiar `makePerson` |
| Estanterías/cajas | copiar `makeShelf`, `stockRow`, `drugKit` |
| Cinta | copiar `beltPart`, `mkBeltTex` |
| Máquina | copiar `M`, `MB`, `mast`, `car`, `pad` |
| Mostrador | copiar el bloque `DX/DZ/DH` |
| Colisiones | copiar `blocked` |
| Audio | copiar `sfx` |

## 8. Recursos que requieren adaptación

| Recurso | Motivo | Plan |
|---|---|---|
| Three.js CDN | offline/iOS | usar `web/three.min.js` |
| Google Fonts | offline/iOS | usar `web/fonts` locales |
| HUD HTML | debe integrarse con V18/SBS | mapear a `#rg-*` o adaptar |
| Loop del juego | debe convivir con VR/Head Tracking | separar escena de lógica |
| 330 cajas | rendimiento | fusionar estáticas; 6 interactivas |
| 728 mallas | rendimiento | merge/instancing selectivo |
| Personajes | escalas y tags de RASMATIC | adaptar `makePerson` a `buildPerson` |
| Máquina | coordenadas locales vs mundo | adaptador `machine.api` |

## 9. Recursos descartados

- El HUD de carrera (`#race`, `#order`, `#mini`, `#steps`) se conserva como
  referencia visual, pero el HUD principal de V20 sigue siendo el V18 de
  RASMATIC para mantener la personalización y el SBS.
- La lógica de `start/end` de 5 pedidos no se usa como regla principal.
- El CDN y las fuentes remotas se eliminan.
