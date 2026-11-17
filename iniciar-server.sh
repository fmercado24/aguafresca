#!/usr/bin/env bash
# Monta el sistema de Agua Fresca SpA · Fundo Entre Ríos en un servidor Ubuntu Server y lo publica en internet
# con un túnel de Cloudflare (con HTTPS y sin abrir puertos en el router ni en el firewall).
#
#   ./iniciar-server.sh             la primera vez instala y publica el sistema; después lo actualiza desde GitHub
#   ./iniciar-server.sh --estado    muestra si el sistema está funcionando y en qué dirección
#   ./iniciar-server.sh --dominio   agrega un dominio propio (si se partió sin dominio) o lo cambia
#   ./iniciar-server.sh --ayuda
#
# Ejecútelo con el usuario normal del servidor (el dueño de esta carpeta), sin sudo: pide la contraseña cuando la necesita.
# El sistema y el túnel quedan como servicios: arrancan solos al encender el servidor y se reinician solos si fallan.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
REPO="$(pwd)"
SCRIPT="$REPO/$(basename "$0")"

CONF_DIR=/etc/aguafresca
CONF="$CONF_DIR/servidor.conf"
SERVICIO_APP=aguafresca
SERVICIO_TUNEL=aguafresca-tunel
PUERTO_DEFECTO=3000
NODE_MAYOR=24            # versión de Node.js que se instala si el servidor no tiene una adecuada (22.13 o superior)
RESPALDOS_A_GUARDAR=15   # respaldos automáticos de la base que se conservan (se hace uno antes de cada actualización)
NODE_OPCIONES=(--disable-warning=ExperimentalWarning)
DIR_DATOS="$REPO/data"
BD="$DIR_DATOS/aguafresca.db"

negrita=$'\e[1m'; verde=$'\e[32m'; amarillo=$'\e[33m'; rojo=$'\e[31m'; normal=$'\e[0m'
if [ ! -t 1 ]; then negrita=""; verde=""; amarillo=""; rojo=""; normal=""; fi
paso()  { printf '\n%s▸ %s%s\n' "$negrita" "$1" "$normal"; }
ok()    { printf '%s✓ %s%s\n' "$verde" "$1" "$normal"; }
aviso() { printf '%s! %s%s\n' "$amarillo" "$1" "$normal"; }
error() { printf '\n%s✗ %s%s\n' "$rojo" "$1" "$normal" >&2; exit 1; }
ayuda() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

preguntar_si() { # $1 = pregunta, $2 = respuesta por defecto (s | n)
  local r def="${2:-s}" opciones="[S/n]"
  [ "$def" = s ] || opciones="[s/N]"
  while true; do
    read -r -p "$1 $opciones " r || r=""
    r="${r,,}"; r="${r:-$def}"
    case "$r" in s|si|sí) return 0 ;; n|no) return 1 ;; esac
    echo "  Responda s (sí) o n (no)."
  done
}

ACCION=auto
ANTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --estado) ACCION=estado ;;
    --dominio) ACCION=dominio ;;
    # Uso interno: si una actualización trae una versión nueva de este script, se continúa con ella.
    --continuar-actualizacion) shift; ACCION=continuar; ANTES="${1:-}"
      [[ "$ANTES" =~ ^[0-9a-f]{40}$ ]] || error "Falta la versión desde la que se actualiza." ;;
    --ayuda|-h|--help) ayuda ;;
    *) error "Opción desconocida: $1 (use --ayuda)" ;;
  esac
  shift
done

if [ "$(id -u)" = 0 ]; then SUDO=(); else SUDO=(sudo); fi
como_root() { "${SUDO[@]}" "$@"; }

DUENO="$(stat -c %U "$REPO")"
if [ "$(id -un)" != "$DUENO" ]; then
  error "Ejecute este script con el usuario \"$DUENO\" (el dueño de la carpeta $REPO), sin sudo:  ./$(basename "$0")"
fi

# ---------- Configuración guardada ----------

MODO=""; DOMINIO=""; TUNEL=""; PUERTO="$PUERTO_DEFECTO"; REPO_INSTALADO=""

cargar_conf() {
  [ -f "$CONF" ] || return 1
  [ "$(stat -c %u "$CONF")" = 0 ] || error "$CONF debe pertenecer a root; no se usará."
  # shellcheck source=/dev/null
  source "$CONF"
  [ "$REPO_INSTALADO" = "$REPO" ] || error "En este servidor el sistema está instalado en $REPO_INSTALADO, no en esta carpeta. Use:  $REPO_INSTALADO/$(basename "$0")"
}

guardar_conf() {
  {
    echo "# Creado por iniciar-server.sh. Para cambiar el dominio use:  ./iniciar-server.sh --dominio"
    printf 'MODO=%q\nDOMINIO=%q\nTUNEL=%q\nPUERTO=%q\nREPO_INSTALADO=%q\n' "$MODO" "$DOMINIO" "$TUNEL" "$PUERTO" "$REPO"
  } | instalar_archivo "$CONF" 644
}

# Escribe un archivo de sistema desde la entrada estándar. Deja CAMBIO=1 si el contenido era distinto.
instalar_archivo() { # $1 = destino, $2 = permisos
  local tmp; tmp="$(mktemp)"
  cat >"$tmp"
  CAMBIO=0
  if ! como_root cmp -s "$tmp" "$1" 2>/dev/null; then
    como_root install -D -m "$2" "$tmp" "$1"
    CAMBIO=1
  fi
  rm -f "$tmp"
}

# ---------- Programas necesarios ----------

apt_instalar() { como_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@"; }

comprobar_sistema() {
  command -v apt-get >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1 \
    || error "Este script es para Ubuntu Server (necesita apt y systemd)."
  grep -qi '^ID=ubuntu' /etc/os-release 2>/dev/null || aviso "Este servidor no parece ser Ubuntu; se intentará igual."
  command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || error "Esta carpeta debe ser una copia del repositorio descargada con \"git clone\" (para poder actualizarla después)."
  if [ ${#SUDO[@]} -gt 0 ]; then
    command -v sudo >/dev/null 2>&1 || error "Se necesita sudo para instalar los programas."
    echo "Se pedirá su contraseña del servidor para instalar programas y crear los servicios (sudo)."
    sudo -v || error "No se pudo usar sudo con este usuario."
  fi
}

node_adecuado() {
  command -v node >/dev/null 2>&1 && node "${NODE_OPCIONES[@]}" -e "
    const [a, b] = process.versions.node.split('.').map(Number);
    if (a < 22 || (a === 22 && b < 13)) process.exit(1);
    require('node:sqlite');" >/dev/null 2>&1
}

instalar_node() {
  if node_adecuado; then ok "Node.js $(node --version) ya está instalado"; return; fi
  paso "Instalando Node.js $NODE_MAYOR…"
  local tmp; tmp="$(mktemp)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAYOR}.x" -o "$tmp" \
    || error "No se pudo descargar el instalador de Node.js. Revise la conexión a internet del servidor."
  como_root bash "$tmp"
  rm -f "$tmp"
  apt_instalar nodejs
  hash -r
  node_adecuado || error "Node.js quedó en una versión que no sirve ($(node --version 2>/dev/null || echo 'sin versión')): se necesita la 22.13 o superior."
  ok "Node.js $(node --version) instalado"
}

instalar_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then ok "cloudflared ya está instalado"; return; fi
  paso "Instalando cloudflared (el programa del túnel de Cloudflare)…"
  como_root mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | como_root tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    | como_root tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  como_root apt-get update -q
  apt_instalar cloudflared
  ok "cloudflared instalado"
}

# ---------- Aplicación ----------

instalar_dependencias() {
  paso "Instalando las dependencias del sistema…"
  npm ci --include=dev --no-fund --no-audit --loglevel=error
}

# Compila la aplicación web en una carpeta aparte: si falla, la que está en uso no se toca.
NUEVA_WEB=""
compilar_web() {
  paso "Compilando la aplicación web…"
  NUEVA_WEB="$(mktemp -d)"
  if npx --no-install tsc --noEmit -p client && npx --no-install vite build --logLevel warn --outDir "$NUEVA_WEB/dist" --emptyOutDir; then
    return 0
  fi
  rm -rf "$NUEVA_WEB"; NUEVA_WEB=""
  return 1
}

publicar_web() {
  rm -rf "$REPO/client/dist"
  mv "$NUEVA_WEB/dist" "$REPO/client/dist"
  chmod 755 "$REPO/client/dist"
  rm -rf "$NUEVA_WEB"; NUEVA_WEB=""
}

resumen_bd() {
  node "${NODE_OPCIONES[@]}" -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const n = (t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
    console.log(n('ventas') + ' ventas, ' + n('clientes') + ' clientes, ' + n('parcelas') + ' parcelas');" "$BD" 2>/dev/null \
    || echo "no se pudo leer su contenido"
}

preparar_datos() {
  paso "Base de datos"
  mkdir -p "$DIR_DATOS"
  if [ -f "$BD" ]; then ok "Se usará la base de datos que ya está en este servidor ($(resumen_bd))"; return; fi
  local ip r
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  cat <<EOF
Todavía no hay una base de datos en este servidor. Hay dos caminos:

  1) Traer la base definitiva (la que se armó con el Excel del contador) desde el computador donde está.
     En ese computador cierre el sistema (Ctrl + C en su ventana) y, en la carpeta del proyecto, ejecute:

       scp data/aguafresca.db* data/plano-loteo.json ${DUENO}@${ip:-DIRECCION-DEL-SERVIDOR}:${DIR_DATOS}/

  2) Empezar con una base nueva: solo los lotes del plano, sin clientes ni ventas.

EOF
  while true; do
    read -r -p "Cuando termine de copiar presione Enter (o escriba \"nueva\" para el camino 2): " r \
      || error "Se necesita una respuesta para continuar."
    if [ "${r,,}" = nueva ]; then
      preguntar_si "¿Seguro que quiere empezar con una base vacía?" n || continue
      DATA_DIR="$DIR_DATOS" ./iniciar.sh --preparar
      return
    fi
    if [ -f "$BD" ]; then
      ok "Base de datos recibida ($(resumen_bd))"
      [ -f "$DIR_DATOS/plano-loteo.json" ] \
        || aviso "No llegó plano-loteo.json: el mapa se verá sin el dibujo del plano de fondo. Cópielo también cuando pueda."
      aviso "Desde ahora los datos se ingresan solo en el servidor: la base del computador queda como respaldo y ya no se actualiza."
      return
    fi
    aviso "Todavía no hay un archivo aguafresca.db en $DIR_DATOS/"
  done
}

puerto_libre() { [ -z "$(ss -Hltn "( sport = :$1 )" 2>/dev/null)" ]; }

elegir_puerto() {
  como_root systemctl stop "$SERVICIO_APP" 2>/dev/null || true
  PUERTO="$PUERTO_DEFECTO"
  while ! puerto_libre "$PUERTO"; do
    PUERTO=$((PUERTO + 1))
    [ "$PUERTO" -le $((PUERTO_DEFECTO + 50)) ] || error "No se encontró un puerto libre para el sistema."
  done
  [ "$PUERTO" = "$PUERTO_DEFECTO" ] || aviso "El puerto $PUERTO_DEFECTO está ocupado por otro programa; el sistema usará el $PUERTO."
}

servicio_app() {
  instalar_archivo "/etc/systemd/system/$SERVICIO_APP.service" 644 <<EOF
[Unit]
Description=Agua Fresca · sistema de gestión (Fundo Entre Ríos)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$DUENO
WorkingDirectory=$REPO
Environment="NODE_ENV=production"
Environment="PORT=$PUERTO"
Environment="LISTEN_HOST=127.0.0.1"
Environment="DATA_DIR=$DIR_DATOS"
Environment="COOKIE_SECURE=true"
Environment="TRUST_PROXY=loopback"
Environment="TZ_APP=America/Santiago"
ExecStart=$(command -v node) ${NODE_OPCIONES[*]} server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
  [ "$CAMBIO" = 0 ] || como_root systemctl daemon-reload
  como_root systemctl enable --quiet "$SERVICIO_APP"
}

app_responde() { curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$PUERTO/" 2>/dev/null; }

esperar_app() {
  local i
  for i in $(seq 1 40); do app_responde && return 0; sleep 1; done
  return 1
}

log_app() { como_root journalctl -u "$SERVICIO_APP" -n "${1:-30}" --no-pager -o cat 2>/dev/null || true; }

# ---------- Túnel de Cloudflare ----------

preguntar_dominio() {
  cat <<EOF

${negrita}¿Cómo se publicará el sistema en internet?${normal}
  • Con un dominio propio (por ejemplo aguafresca.cl), el sistema queda en una dirección fija, como
    https://gestion.aguafresca.cl. El dominio debe estar agregado a una cuenta de Cloudflare (el plan gratuito basta).
  • Sin dominio, se usa una dirección temporal gratuita de Cloudflare (https://palabras-al-azar.trycloudflare.com),
    que cambia cada vez que se reinicia el servidor.

EOF
  if preguntar_si "¿Tiene un dominio propio agregado a Cloudflare?" s; then
    MODO=dominio
    pedir_dominio
  else
    MODO=rapido; DOMINIO=""
    cat <<EOF

Sin dominio:
  • La dirección cambia cuando se reinicia el servidor. Para ver la actual:  ./iniciar-server.sh --estado
  • La app instalada en los celulares y los avisos quedan ligados a la dirección: si cambia, hay que volver a instalarlos.
  • Cloudflare la ofrece para pruebas, sin garantía de funcionamiento.
  Cuando tenga un dominio, agréguelo con:  ./iniciar-server.sh --dominio

EOF
    preguntar_si "¿Continuar con una dirección temporal?" s \
      || { echo "Agregue su dominio a Cloudflare y vuelva a ejecutar este script."; exit 0; }
  fi
}

pedir_dominio() {
  local d
  while true; do
    read -r -p "Dirección con que se abrirá el sistema (por ejemplo gestion.aguafresca.cl): " d \
      || error "Se necesita la dirección para continuar."
    d="${d,,}"; d="${d// /}"; d="${d#https://}"; d="${d#http://}"; d="${d%%/*}"
    if [[ "$d" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; then DOMINIO="$d"; return; fi
    echo "  Escríbala sin https:// ni barras, por ejemplo: gestion.aguafresca.cl"
  done
}

autorizar_cloudflare() {
  cat <<EOF

Ahora hay que autorizar a este servidor en su cuenta de Cloudflare:
  1. Aparecerá un enlace que empieza con https://dash.cloudflare.com/argotunnel
  2. Ábralo en el navegador de cualquier computador o celular e ingrese a su cuenta de Cloudflare.
  3. Elija el dominio de ${DOMINIO} y presione "Authorize". Este script seguirá solo.

EOF
  cloudflared tunnel login || error "No se completó la autorización en Cloudflare. Vuelva a ejecutar el script para reintentar."
}

id_tunel() {
  cloudflared tunnel list -o json -n "$TUNEL" 2>/dev/null | node -e "
    let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
      try { process.stdout.write(JSON.parse(s || '[]')[0]?.id ?? ''); } catch {}
    });" || true
}

configurar_tunel_dominio() {
  paso "Conectando el servidor con su cuenta de Cloudflare…"
  local cert="$HOME/.cloudflared/cert.pem" id salida tmp
  [ -f "$cert" ] || autorizar_cloudflare
  if [ -z "$TUNEL" ]; then
    TUNEL="aguafresca-$(hostname -s | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-')"
  fi
  id="$(id_tunel)"
  if [ -z "$id" ]; then
    cloudflared tunnel create "$TUNEL" >/dev/null || error "No se pudo crear el túnel en Cloudflare."
    id="$(id_tunel)"
  fi
  [ -n "$id" ] || error "No se encontró el túnel \"$TUNEL\" en Cloudflare."
  ok "Túnel \"$TUNEL\" listo"

  # Las credenciales del túnel (solo permiten hacer funcionar este túnel) quedan en /etc/aguafresca, legibles solo por root.
  tmp="$(mktemp -d)"
  cloudflared tunnel token --cred-file "$tmp/tunel.json" "$id" >/dev/null || { rm -rf "$tmp"; error "No se pudieron obtener las credenciales del túnel."; }
  como_root install -D -m 600 "$tmp/tunel.json" "$CONF_DIR/tunel.json"
  rm -rf "$tmp"

  # La dirección se crea en Cloudflare apuntando al túnel (si ya existía otra con ese nombre, se reemplaza).
  local re="${DOMINIO//./\\.}"
  while true; do
    salida="$(cloudflared tunnel route dns --overwrite-dns "$id" "$DOMINIO" 2>&1)" \
      || { echo "$salida" | sed 's/^/  /'; error "No se pudo crear la dirección $DOMINIO en Cloudflare."; }
    if grep -qE "CNAME ${re}( |$)|${re} (is already configured|updated) to route" <<<"$salida"; then break; fi
    echo "$salida" | sed 's/^/  /'
    aviso "Al autorizar en Cloudflare se eligió un dominio distinto al de $DOMINIO, y la dirección quedó bajo ese otro dominio."
    echo "  (Ese registro equivocado se puede borrar en Cloudflare, en DNS → Records.)"
    preguntar_si "¿Autorizar de nuevo eligiendo el dominio correcto?" s \
      || error "No se publicó el sistema. Vuelva a intentarlo con:  ./iniciar-server.sh --dominio"
    mv "$cert" "$cert.anterior"
    autorizar_cloudflare
  done
  ok "Dirección https://$DOMINIO creada en Cloudflare"

  instalar_archivo "$CONF_DIR/tunel.yml" 644 <<EOF
tunnel: $id
credentials-file: $CONF_DIR/tunel.json
ingress:
  - hostname: $DOMINIO
    service: http://127.0.0.1:$PUERTO
  - service: http_status:404
EOF
}

servicio_tunel() {
  local orden
  if [ "$MODO" = dominio ]; then
    orden="$(command -v cloudflared) --no-autoupdate --config $CONF_DIR/tunel.yml tunnel run"
  else
    orden="$(command -v cloudflared) --no-autoupdate tunnel --url http://127.0.0.1:$PUERTO"
  fi
  instalar_archivo "/etc/systemd/system/$SERVICIO_TUNEL.service" 644 <<EOF
[Unit]
Description=Agua Fresca · túnel de Cloudflare
After=network-online.target $SERVICIO_APP.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=$orden
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  [ "$CAMBIO" = 0 ] || como_root systemctl daemon-reload
  como_root systemctl enable --quiet "$SERVICIO_TUNEL"
}

# Mensajes del túnel desde que arrancó por última vez.
log_tunel() {
  local id
  id="$(systemctl show -p InvocationID --value "$SERVICIO_TUNEL" 2>/dev/null || true)"
  [ -n "$id" ] || return 0
  como_root journalctl -q --no-pager -o cat "_SYSTEMD_INVOCATION_ID=$id" 2>/dev/null || true
}

# Deja en URL la dirección pública. Devuelve error si el túnel no se conecta a tiempo.
URL=""
esperar_tunel() {
  local i log
  for i in $(seq 1 45); do
    log="$(log_tunel)"
    if [ "$MODO" = dominio ]; then
      URL="https://$DOMINIO"
      grep -q 'Registered tunnel connection' <<<"$log" && return 0
    else
      URL="$(grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' <<<"$log" | grep -v '^https://api\.' | tail -1 || true)"
      [ -n "$URL" ] && return 0
    fi
    sleep 1
  done
  return 1
}

# ---------- Respaldo de la base ----------

RESPALDO=""
respaldar_bd() {
  RESPALDO=""
  [ -f "$BD" ] || return 0
  mkdir -p "$DIR_DATOS/respaldos"
  RESPALDO="$DIR_DATOS/respaldos/antes-de-actualizar-$(date +%Y-%m-%d-%H%M%S).db"
  node "${NODE_OPCIONES[@]}" -e "
    const { DatabaseSync } = require('node:sqlite');
    new DatabaseSync(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2].replaceAll(\"'\", \"''\") + \"'\");" "$BD" "$RESPALDO" \
    || { RESPALDO=""; return 1; }
  # Se conservan solo los últimos respaldos automáticos.
  find "$DIR_DATOS/respaldos" -maxdepth 1 -name 'antes-de-actualizar-*.db' -printf '%f\n' | sort -r \
    | tail -n +$((RESPALDOS_A_GUARDAR + 1)) | while read -r f; do rm -f "$DIR_DATOS/respaldos/$f"; done
}

restaurar_bd() {
  rm -f "$BD-wal" "$BD-shm"
  cp "$RESPALDO" "$BD"
}

# ---------- Resumen ----------

version_actual() { git --no-pager log -1 --format='%h del %cd' --date=format:'%d-%m-%Y %H:%M'; }

estado_servicio() {
  if systemctl is-active --quiet "$1"; then printf '%sfuncionando%s' "$verde" "$normal"
  else printf '%sdetenido%s' "$rojo" "$normal"; fi
}

mostrar_resumen() {
  if [ "$MODO" = dominio ]; then URL="https://$DOMINIO"; elif [ -z "$URL" ]; then esperar_tunel || true; fi
  echo
  printf '%s  Dirección del sistema:  %s%s\n' "$negrita" "${URL:-(el túnel aún no entrega la dirección)}" "$normal"
  printf '  Sistema:  %s     Túnel de Cloudflare:  %s\n' "$(estado_servicio "$SERVICIO_APP")" "$(estado_servicio "$SERVICIO_TUNEL")"
  printf '  Versión:  %s\n' "$(version_actual)"
  if [ "$MODO" = rapido ]; then
    echo "  Es una dirección temporal: cambia cuando se reinicia el servidor. Para ver la actual:  ./iniciar-server.sh --estado"
  fi
  echo
}

# ---------- Primera instalación ----------

instalar() {
  [ -t 0 ] || error "La primera vez ejecute el script en una terminal: hace algunas preguntas."
  printf '\n%sInstalación del sistema de Agua Fresca en este servidor%s\n' "$negrita" "$normal"
  comprobar_sistema
  preguntar_dominio

  paso "Instalando los programas necesarios…"
  como_root apt-get update -q
  apt_instalar curl ca-certificates git iproute2
  instalar_node
  instalar_cloudflared

  instalar_dependencias
  compilar_web || error "No se pudo compilar la aplicación web (si el servidor tiene menos de 1 GB de memoria, agregue memoria de intercambio)."
  publicar_web

  preparar_datos

  paso "Creando el servicio del sistema (arranca solo al encender el servidor)…"
  elegir_puerto
  servicio_app
  como_root systemctl restart "$SERVICIO_APP"
  esperar_app || { log_app; error "El sistema no logró iniciar; arriba está el detalle."; }
  ok "El sistema está funcionando"

  paso "Publicando en internet con el túnel de Cloudflare…"
  [ "$MODO" != dominio ] || configurar_tunel_dominio
  servicio_tunel
  como_root systemctl restart "$SERVICIO_TUNEL"
  esperar_tunel || aviso "El túnel aún no se conecta; puede tardar un poco. Revise más tarde con:  ./iniciar-server.sh --estado"
  guardar_conf

  ok "Instalación terminada"
  mostrar_resumen
  if [ "$MODO" = dominio ] && ! curl -fsS -o /dev/null --max-time 10 "$URL/" 2>/dev/null; then
    aviso "La dirección puede tardar unos minutos en funcionar mientras Cloudflare la activa."
  fi
  cat <<EOF
Próximos pasos:
  • Abra la dirección en el navegador e ingrese con las cuentas admin, ldiaz o pmercado.
  • En el celular, ábrala en Chrome o Safari y elija "Instalar aplicación" / "Agregar a pantalla de inicio".
  • Para actualizar el sistema después de un cambio publicado en GitHub, ejecute de nuevo:  ./iniciar-server.sh
  • Respalde periódicamente la carpeta $DIR_DATOS (antes de cada actualización se guarda además una copia en data/respaldos).
EOF
}

# ---------- Actualización ----------

DETENIDO=0; WEB_PUBLICADA=0; BD_USADA=0; DEPS_CAMBIARON=0

volver_atras() { # $1 = qué falló
  aviso "No se pudo actualizar: $1."
  echo "  Volviendo a la versión anterior…"
  [ -z "$NUEVA_WEB" ] || { rm -rf "$NUEVA_WEB"; NUEVA_WEB=""; }
  [ "$DETENIDO" = 0 ] || como_root systemctl stop "$SERVICIO_APP" 2>/dev/null || true
  git reset --hard --quiet "$ANTES"
  [ "$DEPS_CAMBIARON" = 0 ] || instalar_dependencias || true
  if [ "$WEB_PUBLICADA" = 1 ]; then { compilar_web && publicar_web; } || true; fi
  if [ "$DETENIDO" = 1 ]; then
    if [ "$BD_USADA" = 1 ] && [ -n "$RESPALDO" ]; then restaurar_bd; fi
    como_root systemctl start "$SERVICIO_APP" || true
  fi
  if esperar_app; then
    error "Se volvió a la versión anterior ($(version_actual)) y el sistema sigue funcionando. Avise a quien mantiene el sistema: el detalle está arriba."
  fi
  log_app
  error "El sistema quedó detenido. Avise a quien mantiene el sistema; el detalle está arriba."
}

actualizar() {
  printf '\n%sActualización del sistema de Agua Fresca%s\n' "$negrita" "$normal"
  [ ${#SUDO[@]} -eq 0 ] || sudo -v || error "No se pudo usar sudo con este usuario."

  paso "Buscando actualizaciones en GitHub…"
  local modificados
  modificados="$(git status --porcelain --untracked-files=no)"
  if [ -n "$modificados" ]; then
    echo "$modificados" | sed 's/^/  /'
    error "Hay archivos del programa modificados a mano en este servidor (arriba). Para descartar esos cambios y actualizar:  git checkout -- . && ./iniciar-server.sh"
  fi
  ANTES="$(git rev-parse HEAD)"
  git pull --ff-only --quiet \
    || error "No se pudo descargar la actualización desde GitHub. Revise la conexión a internet; si el repositorio es privado, que el acceso siga vigente."
  if [ "$(git rev-parse HEAD)" = "$ANTES" ]; then
    ok "El sistema ya tiene la última versión"
    como_root systemctl start "$SERVICIO_APP" "$SERVICIO_TUNEL"
    mostrar_resumen
    return
  fi
  echo "Novedades:"
  git --no-pager log --format='  • %s' "$ANTES..HEAD"
  if ! git diff --quiet "$ANTES" HEAD -- "$(basename "$SCRIPT")"; then
    echo "  (este script también se actualizó: se continúa con su versión nueva)"
    exec "$SCRIPT" --continuar-actualizacion "$ANTES"
  fi
  aplicar_actualizacion
}

aplicar_actualizacion() {
  # cloudflared se mantiene al día (Cloudflare deja de aceptar versiones muy antiguas).
  local version_tunel; version_tunel="$(cloudflared --version 2>/dev/null || true)"
  { como_root apt-get update -qq && apt_instalar --only-upgrade cloudflared >/dev/null; } \
    || aviso "No se pudo actualizar cloudflared; se sigue con la versión instalada."

  if ! git diff --quiet "$ANTES" HEAD -- package.json package-lock.json || [ ! -d node_modules ]; then
    DEPS_CAMBIARON=1
    instalar_dependencias || volver_atras "no se pudieron instalar las dependencias"
  fi
  compilar_web || volver_atras "la aplicación web no compiló"

  paso "Reiniciando el sistema con la versión nueva…"
  servicio_app
  como_root systemctl stop "$SERVICIO_APP" || volver_atras "no se pudo detener el sistema"
  DETENIDO=1
  respaldar_bd || volver_atras "no se pudo respaldar la base de datos"
  [ -z "$RESPALDO" ] || ok "Respaldo de la base: ${RESPALDO#"$REPO"/}"
  publicar_web
  WEB_PUBLICADA=1
  BD_USADA=1
  como_root systemctl start "$SERVICIO_APP" || true
  if ! esperar_app; then log_app 40; volver_atras "la versión nueva no logró iniciar"; fi

  servicio_tunel
  # Con dirección temporal no se reinicia el túnel: la dirección cambiaría.
  if [ "$CAMBIO" = 1 ] || { [ "$MODO" = dominio ] && [ "$(cloudflared --version 2>/dev/null || true)" != "$version_tunel" ]; }; then
    como_root systemctl restart "$SERVICIO_TUNEL"
  else
    como_root systemctl start "$SERVICIO_TUNEL"
  fi
  ok "Sistema actualizado"
  mostrar_resumen
}

# ---------- Agregar o cambiar el dominio ----------

cambiar_dominio() {
  [ -t 0 ] || error "Ejecute esta opción en una terminal: hace algunas preguntas."
  [ ${#SUDO[@]} -eq 0 ] || sudo -v || error "No se pudo usar sudo con este usuario."
  local anterior="$DOMINIO"
  [ -z "$anterior" ] || echo "Dirección actual: https://$anterior"
  echo "El dominio debe estar agregado a una cuenta de Cloudflare (el plan gratuito basta)."
  pedir_dominio
  MODO=dominio
  configurar_tunel_dominio
  servicio_tunel
  como_root systemctl restart "$SERVICIO_TUNEL"
  guardar_conf
  esperar_tunel || aviso "El túnel aún no se conecta; puede tardar un poco. Revise más tarde con:  ./iniciar-server.sh --estado"
  ok "El sistema quedó en https://$DOMINIO"
  [ -z "$anterior" ] || [ "$anterior" = "$DOMINIO" ] \
    || echo "  La dirección anterior ($anterior) dejó de funcionar; su registro se puede borrar en Cloudflare (DNS → Records)."
  echo "  En los celulares hay que instalar la app de nuevo desde la dirección nueva y volver a activar los avisos."
  mostrar_resumen
}

# ---------- Inicio ----------

case "$ACCION" in
  auto)
    if cargar_conf; then actualizar; else instalar; fi ;;
  continuar)
    cargar_conf || error "El sistema aún no está instalado en este servidor."
    aplicar_actualizacion ;;
  estado)
    cargar_conf || error "El sistema aún no está instalado en este servidor. Para instalarlo:  ./iniciar-server.sh"
    mostrar_resumen
    ultimo="$(find "$DIR_DATOS/respaldos" -maxdepth 1 -name '*.db' -printf '%f\n' 2>/dev/null | sort | tail -1 || true)"
    [ -z "$ultimo" ] || echo "  Último respaldo automático: data/respaldos/$ultimo"
    [ "$(systemctl is-active "$SERVICIO_APP" 2>/dev/null || true)" = active ] \
      || { echo "  Últimos mensajes del sistema:"; log_app 15 | sed 's/^/    /'; } ;;
  dominio)
    cargar_conf || error "Primero instale el sistema en este servidor:  ./iniciar-server.sh"
    cambiar_dominio ;;
esac
