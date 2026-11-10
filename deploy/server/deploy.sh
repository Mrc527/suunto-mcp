#!/usr/bin/env bash
# Deploy, roll back, back up and inspect the MCP for PADI service on this server.
#
# The CI/CD pipeline (.github/workflows/ci.yml) copies this folder to the server over SSH and runs
#   bash deploy.sh deploy <image>@sha256:<digest> [git revision]
# with the registry user name and a short-lived token on stdin (two lines).
#
# By hand, as the user that owns this folder (for example: sudo -iu deploy, then cd padi-mcp):
#   ./deploy.sh status       what runs now and the recent deploys
#   ./deploy.sh rollback     go back to the version that ran before the last deploy
#   ./deploy.sh backup       save a consistent copy of the database in /data/backups
#   ./deploy.sh deploy <image>@sha256:<digest>   deploy a specific image
#
# Your settings live in .env (see .env.example); this script only changes its PADI_MCP_IMAGE
# line. Before switching versions it saves a copy of the database in the data volume
# (/data/backups, newest KEEP_BACKUPS kept). If the new version does not become healthy within
# HEALTH_TIMEOUT seconds, it switches back to the last version that was healthy. The output of
# each deploy is also written to .deploy/deploy.log.

set -euo pipefail
umask 077

SERVICE=padi-mcp
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
KEEP_IMAGES=${KEEP_IMAGES:-3}
KEEP_BACKUPS=${KEEP_BACKUPS:-10}
STATE_DIR=.deploy
HISTORY=$STATE_DIR/history
PREVIOUS=$STATE_DIR/previous-image
LOG_FILE=$STATE_DIR/deploy.log
# An image pinned by digest, e.g. ghcr.io/owner/padi-mcp@sha256:<64 hex characters>.
IMAGE_RE='^[a-z0-9][a-z0-9._:/-]*@sha256:[0-9a-f]{64}$'

REG_USER=""
REG_TOKEN=""
REG_CONFIG=""
REG_HOST=""

# shellcheck disable=SC2329 # run by the EXIT trap
cleanup() {
  if [ -n "$REG_CONFIG" ]; then rm -rf "$REG_CONFIG"; fi
}
trap cleanup EXIT

log() { printf '[deploy] %s\n' "$*"; }
die() {
  printf '[deploy] error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: deploy.sh <command>

  status                                show the running version and recent deploys
  rollback                              switch back to the version that ran before
  backup                                save a copy of the database in /data/backups
  deploy <image>@sha256:<digest> [rev]  deploy an image (registry user and token on stdin)
EOF
}

compose() { docker compose "$@"; }

preflight() {
  local owner
  if [ ! -O . ]; then
    owner=$(stat -c %U . 2>/dev/null || echo "the owner of this folder")
    die "run this as $owner, the user that owns $PWD (for example: sudo -iu $owner). Running it as another user, such as root, leaves files the next deploy cannot read."
  fi
  command -v docker >/dev/null 2>&1 || die "docker is not installed on this server"
  docker info >/dev/null 2>&1 || die "cannot reach the Docker daemon. Is the user $(id -un) in the docker group?"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (install the docker-compose-plugin package)"
  [ -f compose.yml ] || die "compose.yml is missing in $PWD"
  [ -f .env ] || die "$PWD/.env does not exist. Run setup-server.sh on this server once (see 'One-time setup' in README.md), or create .env from .env.example (set DOMAIN), then deploy again."
  # compose.yml publishes no port: compose.override.yml (or the bundled Caddy) connects the proxy.
  if [ ! -f compose.override.yml ] && [ -z "${COMPOSE_FILE:-}" ] && ! grep -qsE '^(COMPOSE_FILE=|COMPOSE_PROFILES=.*caddy)' .env; then
    log "warning: there is no compose.override.yml, so your reverse proxy cannot reach the service. Run setup-server.sh (or see step 4 of 'One-time setup' in README.md)."
  fi
  mkdir -p "$STATE_DIR"
}

# Check compose.yml and .env with the given image. Compose replaces $NAME inside unquoted .env
# values and prints the rest of the value in a warning, so stop before that can reach a log.
check_config() {
  local out rc=0
  out=$(PADI_MCP_IMAGE=$1 compose config --quiet 2>&1) || rc=$?
  if grep -qE 'variable is not set|Invalid template' <<<"$out"; then
    die "a value in .env contains \$. Put that value in single quotes, for example ADMIN_PASSWORD='abc\$123'. (Details are hidden because they may contain a password.)"
  fi
  if [ "$rc" -ne 0 ]; then
    printf '%s\n' "$out" >&2
    die "compose.yml or .env is not valid (see the message above)"
  fi
}

# Only one deploy or rollback at a time. Keep running if the SSH connection drops: ignore hangups
# and copy all output to a log file, so a write to the closed connection cannot stop the script.
lock() {
  exec 9>"$STATE_DIR/lock"
  if command -v flock >/dev/null 2>&1; then
    flock -w 900 9 || die "another deploy is still running"
  fi
  trap '' HUP
  if [ -f "$LOG_FILE" ]; then
    tail -n 5000 "$LOG_FILE" >"$LOG_FILE.tmp" && mv -f "$LOG_FILE.tmp" "$LOG_FILE"
  fi
  printf '\n===== %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE"
  # GNU tee -p keeps writing the log after the connection is gone.
  if tee -p </dev/null >/dev/null 2>&1; then
    exec > >(tee -p -a "$LOG_FILE") 2>&1
  else
    exec > >(tee -a "$LOG_FILE") 2>&1
  fi
}

# Value of KEY in .env as this script writes it (only used for PADI_MCP_IMAGE).
env_get() {
  local line
  line=$(grep -E "^$1=" .env | tail -n 1) || true
  line=${line#*=}
  line=${line%$'\r'}
  line=${line%\"}
  line=${line#\"}
  line=${line%\'}
  line=${line#\'}
  printf '%s' "$line"
}

# Set KEY=VALUE in .env, keeping every other line.
env_set() {
  local tmp rc=0
  tmp=$(mktemp .env.XXXXXX)
  grep -vE "^$1=" .env >"$tmp" || rc=$?
  if [ "$rc" -gt 1 ]; then
    rm -f "$tmp"
    die "cannot read .env"
  fi
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  mv -f "$tmp" .env
}

# Registry user name and token (optional) arrive as two lines on stdin.
read_credentials() {
  if [ ! -t 0 ]; then
    IFS= read -r REG_USER || true
    IFS= read -r REG_TOKEN || true
  fi
  REG_USER=${REG_USER%$'\r'}
  REG_TOKEN=${REG_TOKEN%$'\r'}
}

registry_of() {
  local first=${1%%/*}
  case $first in
    *.* | *:* | localhost) printf '%s' "$first" ;;
    *) printf 'docker.io' ;;
  esac
}

# Run docker with the temporary registry login. It lives in its own Docker config folder that is
# deleted when the script ends, so the token never lands in ~/.docker/config.json.
docker_reg() {
  if [ -n "$REG_HOST" ]; then
    env -u DOCKER_CONTEXT DOCKER_CONFIG="$REG_CONFIG" DOCKER_HOST="$REG_HOST" docker "$@"
  else
    env -u DOCKER_CONTEXT DOCKER_CONFIG="$REG_CONFIG" docker "$@"
  fi
}

# Pull an image unless it is already here (images are pinned by digest, so a local copy is always
# the right one).
pull() {
  local image=$1 registry
  if docker image inspect "$image" >/dev/null 2>&1; then return 0; fi
  if [ -z "$REG_TOKEN" ]; then
    docker pull --quiet "$image" >/dev/null
    return
  fi
  if [ -z "$REG_CONFIG" ]; then
    # Keep talking to the same daemon as the current Docker context (for example rootless Docker).
    REG_HOST=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)}
    REG_CONFIG=$(mktemp -d)
    registry=$(registry_of "$image")
    if [ "$registry" = docker.io ]; then registry=https://index.docker.io/v1/; fi
    # Written directly instead of `docker login`, which would hand the token to a credential
    # helper (and fail on servers without a desktop session) if one is installed.
    printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$registry" \
      "$(printf '%s:%s' "${REG_USER:-deploy}" "$REG_TOKEN" | base64 | tr -d '\n')" >"$REG_CONFIG/config.json"
  fi
  docker_reg pull --quiet "$image" >/dev/null
}

# A local tag for each deployed image, so `docker image prune` never removes the running or the
# previous version (images pulled by digest alone count as dangling).
anchor_of() {
  local name=${1%@*} digest=${1##*@sha256:}
  local last=${name##*/}
  if [[ $last == *:* ]]; then name=${name%:*}; fi
  printf '%s:deploy-%s' "$name" "${digest:0:12}"
}

history_add() {
  printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" >>"$HISTORY"
  local tmp
  tmp=$(mktemp "$STATE_DIR/history.XXXXXX")
  tail -n 200 "$HISTORY" >"$tmp" && mv -f "$tmp" "$HISTORY"
}

# Newest image in the history that ran healthy, other than $1.
last_good() {
  [ -f "$HISTORY" ] || return 0
  awk -F '\t' -v skip="$1" '($4 == "deployed" || $4 == "rolled back") && $2 != skip { img = $2 } END { if (img != "") print img }' "$HISTORY"
}

print_url() {
  local url
  url=$(compose config 2>/dev/null | sed -n 's/^ *PUBLIC_URL: *//p' | head -n 1) || true
  url=${url//\"/}
  if [ -n "$url" ]; then log "public url: $url"; fi
}

# Copy the SQLite database with VACUUM INTO (consistent while the service keeps running).
BACKUP_JS=$(
  cat <<'EOF'
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const [stamp, keep] = process.argv.slice(1);
const dir = process.env.DATA_DIR || "/data";
const file = path.join(dir, "padi-mcp.db");
if (!fs.existsSync(file)) {
  console.log("[deploy] no database yet, nothing to back up");
  process.exit(0);
}
const out = path.join(dir, "backups");
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const target = path.join(out, `padi-mcp-${stamp}.db`);
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout = 10000");
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
const all = fs.readdirSync(out).filter((f) => /^padi-mcp-\d{8}T\d{6}Z\.db$/.test(f)).sort();
for (const f of all.slice(0, Math.max(0, all.length - Number(keep)))) fs.rmSync(path.join(out, f));
console.log(`[deploy] database saved to ${target} (inside the data volume)`);
EOF
)

# Run the backup in a one-off container from IMAGE on the data volume, so it also works while the
# service is stopped or restarting.
backup_db() {
  PADI_MCP_IMAGE=$1 compose run --rm --no-deps -T "$SERVICE" \
    node --no-warnings -e "$BACKUP_JS" "$(date -u +%Y%m%dT%H%M%SZ)" "$KEEP_BACKUPS" </dev/null ||
    die "the database backup failed, nothing was changed"
}

# Wait until the service runs the expected image and its health check passes.
wait_healthy() {
  local want deadline next_note cid info img status health restarts
  want=$(docker image inspect -f '{{.Id}}' "$1" 2>/dev/null) || {
    log "image $1 is not available locally"
    return 1
  }
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  next_note=$((SECONDS + 30))
  health=unknown
  while [ "$SECONDS" -lt "$deadline" ]; do
    cid=$(compose ps -q "$SERVICE" 2>/dev/null || true)
    if [ -n "$cid" ]; then
      info=$(docker inspect -f '{{.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' "$cid" 2>/dev/null || true)
      read -r img status health restarts <<<"${info:-- - - 0}"
      if [ "$img" = "$want" ]; then
        if [ "$health" = healthy ]; then return 0; fi
        if [ "$health" = none ] && [ "$status" = running ]; then return 0; fi
        if [ "$health" = unhealthy ]; then
          log "the health check reports unhealthy"
          return 1
        fi
        if [ "$status" = exited ] || [ "$status" = dead ] || [ "${restarts:-0}" != 0 ]; then
          log "the container stopped or restarted (status: $status)"
          return 1
        fi
      fi
    fi
    if [ "$SECONDS" -ge "$next_note" ]; then
      log "still waiting for the health check (status: $health)"
      next_note=$((SECONDS + 30))
    fi
    sleep 3
  done
  log "timed out after ${HEALTH_TIMEOUT}s waiting for the service to become healthy"
  return 1
}

# Remove images of older deploys. Keeps the running one, the previous one and the images of the
# last KEEP_IMAGES healthy deploys.
cleanup_images() {
  local keep=() image
  [ -f "$HISTORY" ] || return 0
  mapfile -t keep < <(awk -F '\t' '$4 == "deployed" || $4 == "rolled back" { print $2 }' "$HISTORY" | tail -n "$KEEP_IMAGES")
  keep+=("$(env_get PADI_MCP_IMAGE)")
  if [ -f "$PREVIOUS" ]; then keep+=("$(cat "$PREVIOUS")"); fi
  while IFS= read -r image; do
    [[ $image =~ $IMAGE_RE ]] || continue
    if printf '%s\n' "${keep[@]}" | grep -qxF -- "$image"; then continue; fi
    docker image rm "$(anchor_of "$image")" >/dev/null 2>&1 || true
    docker image rm "$image" >/dev/null 2>&1 || true
  done < <(awk -F '\t' '{ print $2 }' "$HISTORY" | sort -u)
}

# Start IMAGE (already pulled). On failure switch back to FALLBACK. Returns 0 when IMAGE runs.
switch_to() {
  local image=$1 fallback=$2
  env_set PADI_MCP_IMAGE "$image"
  log "starting $image"
  if compose up -d --remove-orphans && wait_healthy "$image"; then return 0; fi
  log "the new version did not become healthy. Last log lines (e-mail addresses hidden):"
  # This output reaches the CI log, which may be public: hide users' e-mail addresses.
  compose logs --no-color --tail 80 "$SERVICE" 2>&1 | sed -E 's/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}/<e-mail>/g' || true
  if [ -n "$fallback" ] && [ "$fallback" != "$image" ]; then
    log "switching back to $fallback"
    env_set PADI_MCP_IMAGE "$fallback"
    if compose up -d --remove-orphans && wait_healthy "$fallback"; then
      log "the previous version is running again"
      return 1
    fi
    log "the previous version did not become healthy either. Check: docker compose logs $SERVICE"
  else
    log "there is no earlier healthy version to switch back to"
  fi
  return 1
}

cmd_deploy() {
  local image=${1:-} revision=${2:-manual} current fallback
  [[ $image =~ $IMAGE_RE ]] || die "usage: deploy.sh deploy <image>@sha256:<digest> [revision]"
  [[ $revision =~ ^[A-Za-z0-9._-]{1,80}$ ]] || die "invalid revision: $revision"
  read_credentials
  preflight
  check_config "$image"
  lock "deploy $image $revision"
  current=$(env_get PADI_MCP_IMAGE)
  # Normally the running version; if that one never became healthy, the last one that did.
  fallback=$(last_good "$image")
  log "deploying $image (revision $revision)"
  pull "$image" || die "could not pull $image"
  docker tag "$image" "$(anchor_of "$image")"
  if [ -n "$fallback" ]; then
    # Keep the fallback on disk so switching back never needs the registry.
    pull "$fallback" || log "warning: cannot pull $fallback; switching back to it would fail"
    docker tag "$fallback" "$(anchor_of "$fallback")" >/dev/null 2>&1 || true
  fi
  if [ "$current" = "$image" ]; then
    log "this image is already deployed; making sure it runs"
  else
    backup_db "$image"
  fi
  if switch_to "$image" "$fallback"; then
    if [ -n "$fallback" ]; then printf '%s\n' "$fallback" >"$PREVIOUS"; else rm -f "$PREVIOUS"; fi
    history_add "$image" "$revision" deployed
    cleanup_images
    log "done: $image is running and healthy"
    print_url
    return 0
  fi
  history_add "$image" "$revision" failed
  die "deploy failed"
}

# Switch to the version recorded before the last deploy. previous-image is not changed, so a
# second rollback stops with "already running" instead of going forward again.
cmd_rollback() {
  local current previous
  read_credentials
  preflight
  current=$(env_get PADI_MCP_IMAGE)
  previous=$(cat "$PREVIOUS" 2>/dev/null || true)
  [ -n "$previous" ] || die "no previous version is recorded on this server"
  [[ $previous =~ $IMAGE_RE ]] || die "the recorded previous image is not valid: $previous"
  [ "$previous" != "$current" ] || die "the previous version is already running. To go further back or forward, deploy that version again."
  check_config "$previous"
  lock "rollback $previous"
  if ! docker image inspect "$previous" >/dev/null 2>&1; then
    log "pulling $previous"
    pull "$previous" || die "the previous image is not on this server and cannot be pulled"
  fi
  backup_db "$previous"
  if switch_to "$previous" "$current"; then
    history_add "$previous" rollback "rolled back"
    cleanup_images
    log "done: $previous is running and healthy"
    print_url
    return 0
  fi
  history_add "$previous" rollback "rollback failed"
  die "rollback failed"
}

cmd_backup() {
  local current
  preflight
  current=$(env_get PADI_MCP_IMAGE)
  [ -n "$current" ] || die "nothing has been deployed here yet"
  check_config "$current"
  backup_db "$current"
}

cmd_status() {
  local current
  preflight
  current=$(env_get PADI_MCP_IMAGE)
  if [ -z "$current" ]; then
    log "nothing has been deployed here yet"
    return 0
  fi
  check_config "$current"
  log "image: $current"
  if [ -f "$PREVIOUS" ]; then log "previous: $(cat "$PREVIOUS")"; fi
  print_url
  compose ps
  if [ -f "$HISTORY" ]; then
    log "recent deploys:"
    tail -n 10 "$HISTORY"
  fi
}

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")"
  local cmd=${1:-help}
  if [ $# -gt 0 ]; then shift; fi
  case $cmd in
    deploy) cmd_deploy "$@" ;;
    rollback) cmd_rollback ;;
    backup) cmd_backup ;;
    status) cmd_status ;;
    help | -h | --help) usage ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

# Keep this on one line: bash has then read the whole command before running it, so the
# pipeline can replace this file even while an older copy is still running.
main "$@"; exit $?
