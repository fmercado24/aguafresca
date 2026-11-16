#!/usr/bin/env bash
# Inicia el sistema de gestión de Agua Fresca SpA · Fundo Entre Ríos en este computador.
#
#   ./iniciar.sh                  inicia el sistema en http://localhost:3000
#   ./iniciar.sh --demo           la primera vez, carga datos ficticios de demostración sobre el loteo real
#   ./iniciar.sh --puerto 8080    usa otro puerto
#   ./iniciar.sh --clave ldiaz    restablece la contraseña de una cuenta (admin, ldiaz o pmercado)
#   ./iniciar.sh --ayuda
#
# La primera vez pide las contraseñas de las tres cuentas (Enter = se genera una al azar) y carga
# los lotes del plano del topógrafo (server/datos/loteo.json).
set -euo pipefail

cd "$(dirname "$0")"

PUERTO="${PORT:-3000}"
DEMO=0
CUENTA_CLAVE=""
DIR_DATOS="${DATA_DIR:-data}"
BD="${DB_PATH:-$DIR_DATOS/aguafresca.db}"
NODE_OPCIONES=(--disable-warning=ExperimentalWarning)

negrita=$'\e[1m'; verde=$'\e[32m'; rojo=$'\e[31m'; normal=$'\e[0m'
if [ ! -t 1 ]; then negrita=""; verde=""; rojo=""; normal=""; fi
paso() { printf '%s▸ %s%s\n' "$negrita" "$1" "$normal"; }
error() { printf '%s✗ %s%s\n' "$rojo" "$1" "$normal" >&2; exit 1; }

ayuda() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --puerto|-p) shift; PUERTO="${1:-}"; [[ "$PUERTO" =~ ^[0-9]+$ ]] || error "Indique un número de puerto, por ejemplo: --puerto 8080" ;;
    --clave) shift; CUENTA_CLAVE="${1:-}"; [ -n "$CUENTA_CLAVE" ] || error "Indique la cuenta: --clave admin | ldiaz | pmercado" ;;
    --ayuda|-h|--help) ayuda ;;
    *) error "Opción desconocida: $1 (use --ayuda)" ;;
  esac
  shift
done

# ---------- Requisitos ----------

command -v node >/dev/null 2>&1 || error "No se encontró Node.js. Instale la versión 22.13 o superior desde https://nodejs.org"
if ! node "${NODE_OPCIONES[@]}" -e "require('node:sqlite')" >/dev/null 2>&1; then
  error "Se necesita Node.js 22.13 o superior (este equipo tiene $(node --version))."
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  paso "Instalando dependencias (solo la primera vez o cuando cambian)…"
  npm install --no-fund --no-audit
  touch node_modules/.package-lock.json
fi

# Se compila la aplicación web si no existe o si algún archivo cambió desde la última compilación.
if [ ! -f client/dist/index.html ] || [ -n "$(find client/src client/public client/index.html vite.config.ts -newer client/dist/index.html -print -quit 2>/dev/null)" ]; then
  paso "Compilando la aplicación web…"
  npx vite build --logLevel warn
fi

# ---------- Restablecer una contraseña ----------

leer_clave() {
  # $1 = texto a mostrar; deja el resultado en CLAVE_LEIDA ("" = generar al azar)
  local primera segunda
  while true; do
    read -r -s -p "$1" primera; echo
    if [ -z "$primera" ]; then CLAVE_LEIDA=""; return; fi
    if [ "${#primera}" -lt 8 ]; then echo "  Debe tener al menos 8 caracteres."; continue; fi
    read -r -s -p "  Repítala: " segunda; echo
    if [ "$primera" != "$segunda" ]; then echo "  No coinciden, intente de nuevo."; continue; fi
    CLAVE_LEIDA="$primera"; return
  done
}

if [ -n "$CUENTA_CLAVE" ]; then
  [ -f "$BD" ] || error "Todavía no existe la base de datos: inicie el sistema una vez con ./iniciar.sh"
  CLAVE_LEIDA=""
  if [ -t 0 ]; then leer_clave "Nueva contraseña para \"$CUENTA_CLAVE\" (Enter = generar una al azar): "; fi
  NUEVA_CLAVE="$CLAVE_LEIDA" DATA_DIR="$DIR_DATOS" exec node "${NODE_OPCIONES[@]}" server/clave.js "$CUENTA_CLAVE"
fi

# ---------- Primer arranque: contraseñas de las tres cuentas ----------

if [ ! -f "$BD" ]; then
  echo
  printf '%sPrimer inicio del sistema%s\n' "$negrita" "$normal"
  echo "Se crearán las tres cuentas. Escriba una contraseña para cada una (mínimo 8 caracteres),"
  echo "o presione Enter para que se genere una al azar (se mostrará al final)."
  echo
  if [ -t 0 ]; then
    CLAVE_LEIDA=""; leer_clave "  admin     (super administrador): "; export CLAVE_ADMIN="$CLAVE_LEIDA"
    CLAVE_LEIDA=""; leer_clave "  ldiaz     (abogado):             "; export CLAVE_LDIAZ="$CLAVE_LEIDA"
    CLAVE_LEIDA=""; leer_clave "  pmercado  (contador):            "; export CLAVE_PMERCADO="$CLAVE_LEIDA"
  else
    echo "  (sin terminal interactiva: las tres contraseñas se generan al azar)"
  fi
  echo
  if [ "$DEMO" = 1 ]; then
    paso "Cargando datos de demostración (ficticios, sobre los lotes del plano)…"
    DATA_DIR="$DIR_DATOS" node "${NODE_OPCIONES[@]}" server/seed-demo.js
  elif [ -f server/datos/loteo.json ]; then
    paso "Cargando los lotes del plano del topógrafo (con precio por definir)…"
    DATA_DIR="$DIR_DATOS" node "${NODE_OPCIONES[@]}" server/importar-loteo.js
  fi
elif [ "$DEMO" = 1 ]; then
  echo "Ya existe una base de datos en $DIR_DATOS/: no se cargan los datos de demostración."
  echo "Para empezar de cero, detenga el sistema y mueva o borre esa carpeta."
fi

# ---------- Iniciar ----------

paso "Iniciando el sistema…"
printf '%sAbra en el navegador:  http://localhost:%s%s\n\n' "$verde" "$PUERTO" "$normal"
PORT="$PUERTO" DATA_DIR="$DIR_DATOS" exec node "${NODE_OPCIONES[@]}" server/index.js
