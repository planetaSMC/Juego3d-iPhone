# Instalar la app en un iPhone

Desde V20 hay **una sola app** en `ios/RasmaticLugar3D.xcodeproj`:

- **RASMATIC VR** · `com.rasmatic.lugar3d`

Incluye Head Tracking integrado, el escenario de farmacia del HTML, los tres
modos, las tres dificultades, joystick opcional, mando Bluetooth y VR SBS.
Es una app de iOS de verdad (icono propio, pantalla completa, sin Safari,
funciona sin internet y sin la PC). Lo único que falta es **convertirla en un
archivo instalable (`.ipa`)**, y eso Apple solo lo permite compilando en macOS.

Detalle de la versión: `docs/v20/README.md`. V19 queda recuperable desde Git
(rama `v19-recovery`).

No hace falta comprar una Mac. Hay cuatro caminos; la guía de 11 pasos por USB
es la principal.

| Ruta | Qué necesitás | Costo | Cuánto dura la instalación | Tiempo |
|---|---|---|---|---|
| **1. USB en Windows** (11 pasos, abajo) | PC Windows + cuenta Apple gratis + `.ipa` compilado | $0 | 7 días, se renueva | ~1 h la primera vez |
| **2. Mac** (propia, prestada o alquilada) | Mac con Xcode 15+ y un cable | $0 si es prestada · ~US$1 la hora si es alquilada | 7 días (cuenta gratis) · 1 año (cuenta paga) | ~30 min |
| **3. TestFlight** | Cuenta Apple Developer | US$99 al año | 90 días por versión | ~2 h |
| **4. PWA** | Nada | $0 | Para siempre, pero es una web con icono | 5 min |

> Regla de Apple, no del port: **no existe** forma de instalar una app propia en
> un iPhone sin firmarla con una cuenta Apple y sin compilarla en macOS (o en un
> macOS de la nube). Tampoco existe un `.ipa` "gratis y permanente". **No hace
> falta jailbreak** en ningún paso.

Antes de empezar, el `.ipa` tiene que existir. Si todavía no lo tenés:

1. Subí el proyecto a GitHub.
2. **Actions → iOS app V20 (RASMATIC VR) → Run workflow**.
3. Descargá el artefacto `rasmatic-v20-ipa`.

Adentro está `RASMATIC-VR-unsigned.ipa`. También podés generarlo en una Mac con
`./tools/build-ipa.sh`. Detalle en `docs/v20/README.md` y
`docs/firma-y-requisitos.md`.

---

## Ruta 1 — Instalar por USB en Windows: 11 pasos

Es la ruta recomendada si tenés PC con Windows y un cable. Usa **Sideloadly**,
que firma el `.ipa` con tu Apple ID y lo instala sin dejar nada corriendo.

### Paso 1 — Reunir los requisitos

- Windows 10 u 11.
- Cable USB de datos (no todos los cables baratos sirven; probá con otro si el
  iPhone no aparece).
- iPhone con **iOS 15 o posterior**, desbloqueado y con código de acceso.
- Una **cuenta Apple** (gratis alcanza). Si tiene doble factor, tené a mano el
  teléfono o el código de 6 dígitos.
- `RASMATIC-VR-unsigned.ipa`.
- Unos 30–60 minutos la primera vez.

### Paso 2 — Instalar iTunes e iCloud desde la web de Apple

Descargalos de `apple.com/itunes` y `apple.com/icloud`, **no** de la Microsoft
Store. La versión de la Store no instala los controladores que Sideloadly
necesita.

1. Instalar iTunes y abrirlo una vez.
2. Instalar iCloud y abrirlo una vez.
3. Reiniciar la PC si Windows lo pide.

> Si ya tenías la versión de la Microsoft Store, desinstalala antes de instalar
> la de Apple.

### Paso 3 — Instalar Sideloadly

1. Descargar Sideloadly de `sideloadly.io`.
2. Instalarlo con las opciones por defecto.
3. Abrirlo una vez para que Windows termine de registrar los controladores.

### Paso 4 — Conectar el iPhone y confiar en la PC

1. Conectar el iPhone por USB.
2. Desbloquearlo.
3. Cuando aparezca **“¿Confiar en este ordenador?”**, tocar **Confiar** e
   ingresar el código de acceso.
4. En iTunes (o en el Explorador de Windows) tiene que aparecer el iPhone. Si no
   aparece, probá otro cable, otro puerto USB (mejor uno directo, no un hub) y
   volvé a confiar.

### Paso 5 — Activar el Modo de desarrollador (iOS 16 o posterior)

En iOS 16+ una app firmada para desarrollo no arranca sin este modo.

1. **Ajustes → Privacidad y seguridad → Modo de desarrollador**.
2. Activarlo y reiniciar el iPhone.

Si la opción **no aparece**, no pasa nada: suele aparecer después del primer
intento de instalar una app de desarrollo. Volvé a este paso después del 8.

### Paso 6 — Abrir Sideloadly y cargar el `.ipa`

1. Verificar que arriba, en **Device**, esté seleccionado el iPhone.
2. Arrastrar `RASMATIC-VR-unsigned.ipa` a la ventana, o tocar el icono del
   clip y elegirlo.
3. No cambiar el **Bundle ID** salvo que Sideloadly avise que ya existe; en ese
   caso poné uno propio, por ejemplo `com.tunombre.rasmatic`.

### Paso 7 — Escribir la cuenta Apple

1. En **Apple account**, escribir el Apple ID (el correo).
2. Tocar **Start**.
3. Sideloadly pide la contraseña. Si la cuenta tiene doble factor, conviene usar
   una **contraseña de aplicación** (se genera en `appleid.apple.com`), o
   escribir la contraseña normal y luego el código de 6 dígitos.
4. Si aparece un aviso de “Apple ID o contraseña incorrectos”, revisá el correo
   y la contraseña de aplicación; no es un problema del juego.

### Paso 8 — Esperar la firma e instalación

Sideloadly firma el `.ipa` con tu certificado, lo sube al iPhone y lo instala.
Tarda entre 1 y 5 minutos. Al terminar dice **Done** y el icono **RASMATIC**
aparece en la pantalla de inicio.

No desconectes el cable hasta que termine.

### Paso 9 — Confiar en el certificado

1. En el iPhone: **Ajustes → General → VPN y gestión de dispositivos**.
2. En **Desarrollador de apps**, tocar tu Apple ID.
3. Tocar **Confiar en “<tu Apple ID>”** y confirmar.

Sin este paso la app muestra “Desarrollador no confiable” y no abre.

### Paso 10 — Abrir la app y probarla

1. Abrir **RASMATIC** desde el icono.
2. Tiene que verse el vestíbulo en 3D, con el HUD, el joystick táctil y el aviso
   del encargado.
3. Activar **modo avión** y volver a abrirla: el juego tiene que funcionar igual
   (todo el contenido viaja dentro de la app).
4. Conectar el mando por Bluetooth (**Ajustes → Bluetooth**) y comprobar el
   aviso **“Mando conectado: <nombre>”**. Ver `docs/mando-bluetooth.md`.
5. Para VR: tocar el botón **VR BOX** arriba al centro o la **X** del mando.
   Girar el iPhone a horizontal. Ver `docs/vr-box-preview.md`.

### Paso 11 — Renovar antes de los 7 días

La cuenta gratuita firma por **7 días**. Cuando la app deje de abrir:

1. Conectar el iPhone por USB.
2. Abrir Sideloadly con el mismo `.ipa` y la misma cuenta.
3. Tocar **Start** otra vez.

No se pierde nada de la app: es la misma instalación, solo se renueva la firma.
Con AltStore la renovación puede ser automática por Wi-Fi mientras la PC esté
encendida. Con TestFlight o cuenta paga no hace falta.

---

## Problemas frecuentes (Windows + USB)

| Síntoma | Causa y solución |
|---|---|
| Sideloadly no ve el iPhone | Cable de solo carga, puerto USB defectuoso o falta confiar en la PC. Probar otro cable/puerto, desbloquear y tocar **Confiar**. |
| “Apple Mobile Device Service no está instalado” | Se instaló iTunes de la Microsoft Store. Desinstalarlo e instalar el de `apple.com/itunes`. |
| “No se puede instalar / no está disponible en este dispositivo” | La firma no cubre el iPhone. Volver a firmar con el teléfono conectado y el mismo Apple ID. |
| “Desarrollador no confiable” al abrir | Ajustes → General → VPN y gestión de dispositivos → Confiar en el certificado (paso 9). |
| La app abre y se cierra sola en iOS 16+ | Activar **Modo de desarrollador** (paso 5) y reiniciar. |
| “Failed to register bundle identifier” | El bundle id ya está tomado. Cambiarlo por uno propio en Sideloadly o en el proyecto. |
| “This app cannot be installed because its integrity could not be verified” | La firma venció o el perfil no incluye el dispositivo. Volver a firmar. |
| Deja de abrir a los 7 días | Venció la firma gratuita: renovar (paso 11). Con TestFlight o cuenta paga no pasa. |
| La app abre en blanco | Verificar que el `.ipa` traiga `www/index.html` (`node tools/verify-ipa.js ...`). Si el `.ipa` está bien, cerrar y abrir la app. |
| El mando no aparece | Ver `docs/mando-bluetooth.md` § Problemas frecuentes. |
| Windows pide “Buscar controladores” | Instalar iTunes/iCloud de Apple y reiniciar; no usar drivers genéricos. |
| La instalación queda en “Installing” para siempre | Desconectar, reiniciar el iPhone y la PC, y repetir desde el paso 4. |

---

## Ruta 2 — Con una Mac (la más directa)

Vale una Mac de un conocido, una del trabajo, o una alquilada por hora
(MacinCloud, Scaleway Mac mini, MacStadium: entre US$1 y US$30 según el plan;
con 1 hora alcanza).

1. Copiar la carpeta `ios/` a la Mac (o todo el proyecto).
2. Abrir `ios/RasmaticLugar3D.xcodeproj` con **Xcode 15** o posterior.
3. Menú **Xcode → Settings → Accounts → +** → iniciar sesión con el Apple ID
   (una cuenta gratis sirve).
4. Seleccionar el proyecto `RasmaticLugar3D` → pestaña **Signing &
   Capabilities**:
   - **Team**: elegir el Apple ID recién agregado.
   - **Bundle Identifier**: `com.rasmatic.lugar3d`. Si Xcode dice que ya existe,
     cambiar por algo único, por ejemplo `com.tunombre.rasmatic`.
5. Conectar el iPhone por cable, desbloquearlo y tocar **Confiar**.
6. Arriba, elegir el iPhone como destino y tocar ▶ (**Run**).
7. En el iPhone: **Ajustes → General → VPN y gestión de dispositivos →**
   (tu Apple ID) **→ Confiar**. (En iOS 16 o posterior, si lo pide:
   **Ajustes → Privacidad y seguridad → Modo de desarrollador → activar** y
   reiniciar.)

Listo: la app queda instalada con su icono y funciona sin la Mac y sin internet.

**Para dejarla en 1 año en vez de 7 días** hay que tener la cuenta Apple
Developer Program (US$99/año); con la cuenta gratis, la app deja de abrir a los
7 días y hay que volver a darle ▶ desde Xcode (30 segundos, sin reinstalar).

**Si además querés el archivo `.ipa`** (para guardarlo o pasarlo a otra PC):

```bash
chmod +x tools/build-ipa.sh
./tools/build-ipa.sh
# deja dist/RASMATIC-VR-unsigned.ipa
```

---

## Ruta 3 — TestFlight (instalación permanente y sin cable)

Requiere **Apple Developer Program** (US$99 al año). Es lo que se usa para
repartir la app a varias personas.

1. Inscribirse en el programa con el Apple ID (`developer.apple.com/programs`).
2. En **App Store Connect**, crear una app:
   `com.rasmatic.lugar3d`.
3. Compilar y subir: con Xcode en una Mac (▶ **Product → Archive → Distribute
   App → App Store Connect**) o desde la nube (Codemagic, Xcode Cloud o GitHub
   Actions con una clave de App Store Connect).
4. En App Store Connect → **TestFlight**, agregar los correos de los probadores
   (hasta 10.000 por enlace público).
5. Cada persona instala **TestFlight** desde la App Store y abre el enlace de
   invitación. La app queda como cualquier otra, sin cables y sin PC.

Cada versión subida dura **90 días** en TestFlight; se renueva subiendo otra.

---

## Ruta 4 — PWA (sin Mac, sin cuenta, sin límite)

Es la que ya está explicada en el `README.md`: `node tools/serve.js`, abrir la
dirección LAN en Safari y **Compartir → Añadir a pantalla de inicio**. Queda con
icono y pantalla completa, pero **es una web**: depende de que la PC esté
encendida (o de servirla por https), y no es una app instalada como tal.

---

## Cómo saber que quedó bien instalada

- Aparece el icono **RASMATIC** en la pantalla de inicio, con el logo del juego.
- Abre a pantalla completa: sin barra de direcciones, sin barra de estado.
- **Modo avión activado** → la app sigue abriendo y el juego funciona (todo el
  contenido viaja adentro).
- Joystick táctil, cámara arrastrando el dedo, HUD, CNC, bot y la partida de
  3 minutos se comportan igual que en Android.
- Al conectar un mando Bluetooth aparece **“Mando conectado: <nombre>”** y se
  oculta el joystick táctil.
- El botón **VR BOX** abre el modo estéreo y se puede salir con el botón
  **Salir** del panel (sin quedar atrapado).

## Lo que no se pudo verificar en este entorno

Este proyecto se preparó en Windows: **no hay macOS ni iPhone acá**, así que no
se pudo ejecutar `xcodebuild`, ni firmar, ni abrir la app en un dispositivo. Lo
que sí está verificado: la estructura del proyecto (123 comprobaciones), el
contenido embebido byte a byte contra el APK Android, el juego completo en un
navegador con viewport de iPhone (21 casos + offline + horizontal) y el mando/
VR móvil simulados (21 casos). Ver `docs/pruebas.md`.

---

## Anexo — Publicar en GitHub sin saber git (API)

Si preferís no usar la web de GitHub, `tools/publish-github.js` hace todo por
API: crea el repositorio, sube los archivos, lanza la compilación, espera y deja
el `.ipa` en `dist/`.

1. Crear un **token fine-grained** en GitHub:
   *Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token*, con *Contents*, *Actions* y *Workflows* en
   **Read and write**, y vencimiento corto (7 días).
2. Guardarlo en un archivo de texto fuera del proyecto, por ejemplo
   `C:\Users\valen\AppData\Local\Temp\gh-token.txt`.
3. Ejecutar:

   ```powershell
   node tools/publish-github.js --token-file C:\Users\valen\AppData\Local\Temp\gh-token.txt
   ```

   Opciones: `--repo <nombre>`, `--private`, `--no-wait`, `--dry-run`.
4. Al terminar: el `.ipa` en `dist/` con su SHA-256, ya
   verificado con `tools/verify-ipa.js` (estructura, Mach-O, bundle id y juego
   completo).
5. Revocar el token en GitHub cuando ya no se use.

El script nunca imprime el token ni lo escribe en disco.
