# Rocket League — Panel en vivo

Dashboard web local y en tiempo real para Rocket League. Lee la **Stats API** que el
juego expone en tu PC (`127.0.0.1:49123`) y muestra la partida en vivo: marcador,
jugadores, rangos/MMR, historial de la sesión, evolución de MMR y un feed de eventos.

Funciona como **un solo proceso** (Node sirve la app ya compilada) y se puede
**instalar como app (PWA)** y **arrancar solo al encender el PC**.

---

## Funcionalidades

- **Marcador en vivo** desde la Stats API local: cada jugador con su nombre,
  plataforma, stats (score, goles, asistencias, saves, tiros, toques, demos) y barra
  de boost.
  - El boost del **equipo rival no se muestra** mientras juegas: la API solo envía
    ese dato de tu propio equipo (campo *spectator*), así que se oculta en vez de
    mostrar un "0" falso.
- **Panel de rango/MMR por jugador** de toda la partida, con datos al día de
  tracker.gg: tier, división y MMR. Un único **toggle global 1v1 / 2v2 / 3v3** cambia
  el modo mostrado para todos a la vez.
- **Detección fiable de victorias/derrotas**:
  - El ganador se decide por el **marcador final** (en RL gana siempre quien marca
    más goles; no hay empates).
  - "Tú" se identifica por **votación de cámara** (el objetivo de la cámara durante
    la sesión casi siempre eres tú), con **override manual**: haz clic en tu tarjeta
    para marcarte con el badge **YOU** (se guarda y persiste).
  - Las salidas/forfeits (partida destruida antes de `MatchEnded`) se cuentan también.
- **Historial de sesión** con W/L, racha actual (`🔥`/`🧊`) y marcador.
- **Seguimiento de MMR de la sesión**: MMR inicial → actual, delta total y el
  **delta por partida** junto a cada resultado. El MMR tarda ~1 min en actualizarse
  tras la partida, así que se hace *polling* y se reacciona cuando cambia de verdad.
- **Gráfica de MMR de la sesión** (sparkline) con mín/máx.
- **Stats acumuladas de la sesión**: win rate, goles/asistencias/saves (totales y por
  partida), % de tiro, demos, **MVPs** (el de mayor score del equipo ganador) y mejor
  racha.
- **Feed de eventos en vivo**: goles (con asistencia y velocidad), saves, epic saves,
  demoliciones, playmaker, MVP… resaltando los tuyos.
- **Sesión persistente**: el historial y el MMR sobreviven a recargas. Se reinicia
  solo tras ~6 h de inactividad (sesión nueva) o con el botón **"New session"**.

---

## Requisitos

- **Node.js** (LTS recomendado): https://nodejs.org
- **Stats API de Rocket League** activada en `127.0.0.1:49123`
- Windows con `curl` en el PATH (viene de serie en Windows 10/11). Se usa para
  consultar tracker.gg sorteando su protección anti-bots.

---

## Activar la Stats API en Rocket League

1. Antes de abrir el juego, edita:
   `\<Carpeta de instalación>\TAGame\Config\DefaultStatsAPI.ini`
2. Pon estos valores:
   - `PacketSendRate` = cualquier valor `> 0` (por ejemplo `60`; máximo `120`)
   - `Port` = `49123`
3. Guarda y abre Rocket League. Entra a una partida (o entrenamiento libre).

> Cualquier cambio en el `.ini` requiere reiniciar el juego.

---

## Uso diario (recomendado)

Tras la configuración inicial, el día a día es **un solo paso**: abrir la app.

1. **Configura el auto-arranque una vez**: doble clic en `install-autostart.bat`.
   El servidor se iniciará oculto (sin terminal) cada vez que inicies sesión en
   Windows.
2. **Instala la PWA una vez**: abre `http://localhost:3001` en Edge/Chrome y pulsa
   **Instalar** en la barra de direcciones (o menú ⋮ → *Apps → Instalar*). Quedará
   como una app con su propio icono y ventana.
3. **A diario**: solo abres el icono de la app. El motor ya está corriendo de fondo.

### Sin auto-arranque (modo manual)

Si prefieres no dejarlo de fondo: doble clic en `start-app.bat` (arranca el motor y
abre la app) y ciérralo cuando termines. Es "inteligente": si el servidor ya está
levantado, solo abre la app en vez de arrancar otro.

---

## Scripts auxiliares (`.bat`)

- `start-app.bat` — arranca el servidor (con ventana) y abre la app; si ya está
  corriendo, solo abre la app.
- `install-autostart.bat` — activa el arranque automático oculto al iniciar sesión.
- `uninstall-autostart.bat` — lo desactiva.
- `stop-app.bat` — detiene **solo** este servidor (no afecta a otros procesos Node).

---

## Scripts de npm

- `npm run app` — compila (`build`) y sirve todo desde Node en `http://localhost:3001`
  (lo que usan los `.bat`).
- `npm run build` — genera la versión de producción en `dist/`.
- `npm run serve` / `npm run proxy` — arranca solo el servidor Node (sirve `dist/` +
  el relay del juego + el proxy de tracker.gg).
- `npm run dev` — modo desarrollo: Vite + servidor Node a la vez (recarga en caliente).
- `npm run lint` — ESLint.

> Si **cambias código**, ejecuta `npm run build` y reinicia el servidor
> (`stop-app.bat` y vuelve a abrir, o reinicia el PC). El servidor sirve el build, no
> el código en vivo.

---

## Cómo funciona

- `proxy.js` es un servidor Node único (puerto **3001**) que:
  - En `/rl` abre una conexión TCP a la Stats API del juego y la transmite al
    navegador como un stream HTTP.
  - En `/tracker/<plataforma>/<id>` consulta la API interna de tracker.gg (vía `curl`
    del sistema, para esquivar el filtrado por *fingerprint* TLS) y devuelve el perfil
    (rango/MMR/stats).
  - El resto de rutas sirven la app compilada de `dist/` (con *fallback* SPA).
- La app React parsea los mensajes JSON del stream y actualiza la interfaz en vivo
  (eventos: `UpdateState`, `GoalScored`, `StatfeedEvent`, `MatchEnded`,
  `MatchDestroyed`, etc.).
- En desarrollo, Vite reenvía `/rl` y `/tracker` al servidor Node; en producción todo
  va por el mismo origen, así que no hace falta Vite.

---

## Solución de problemas

- **Página en blanco / sin datos del juego**: revisa que la Stats API esté activada
  (`DefaultStatsAPI.ini`) y que estés dentro de una partida.
- **No carga la app (no conecta a `localhost:3001`)**: el servidor no está corriendo.
  Abre `start-app.bat`, o comprueba el auto-arranque con `install-autostart.bat`.
- **Un jugador sale como "No tracker data"**: tracker.gg no lo tiene indexado todavía
  o falló la consulta; suele resolverse al reintentar (la app reintenta hasta 3 veces).
- **El badge YOU está en el jugador equivocado**: haz clic en tu tarjeta para fijarte
  manualmente (se guarda).
- **El delta de MMR de la última partida tarda**: es normal, el MMR del juego se
  actualiza ~1 min después; aparece como `…` hasta entonces.
- **`npm` no encontrado**: instala Node.js y reabre la terminal.

---

## Notas de Git

Se recomienda excluir (ya está en `.gitignore`): `node_modules/`, `dist/`, `*.zip`,
`vite.log`, `proxy-output.txt`.
