#!/usr/bin/env bash
# Start a built Docker image the way production runs it and check that the web service works.
# CI runs this for every platform before an image is published.
#
#   scripts/smoke-test-image.sh <image> [platform]      e.g. padi-mcp:test linux/arm64
set -euo pipefail

image=${1:?usage: smoke-test-image.sh <image> [platform]}
platform=${2:-}
port=${SMOKE_PORT:-3999}
base="http://127.0.0.1:$port"
name="padi-mcp-smoke-$$"
label="$image${platform:+ ($platform)}"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  echo "smoke test failed for $label: $*" >&2
  docker logs --tail 50 "$name" >&2 || true
  exit 1
}

# Same restrictions as deploy/server/compose.yml.
args=(run -d --name "$name" -p "127.0.0.1:$port:3000" -e "PUBLIC_URL=http://localhost:$port"
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true)
if [ -n "$platform" ]; then args+=(--platform "$platform"); fi
docker "${args[@]}" "$image" >/dev/null

# Emulated platforms start slowly, so allow up to two minutes.
body=""
for _ in $(seq 1 60); do
  if body=$(curl -fsS --max-time 3 "$base/healthz" 2>/dev/null); then break; fi
  body=""
  [ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ] || fail "the container stopped"
  sleep 2
done
[ -n "$body" ] || fail "/healthz did not answer"
grep -q '"status":"ok"' <<<"$body" || fail "unexpected /healthz answer: $body"

meta=$(curl -fsS --max-time 5 "$base/.well-known/oauth-authorization-server") || fail "no OAuth authorization server metadata"
grep -q "\"issuer\":\"http://localhost:$port\"" <<<"$meta" || fail "wrong issuer in $meta"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$base/mcp" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{}')
[ "$code" = 401 ] || fail "POST /mcp answered $code instead of 401"

curl -fsS --max-time 5 "$base/login" | grep -q '<form' || fail "the sign-in page did not render"
curl -fsS --max-time 5 "$base/site.webmanifest" | grep -q '"name":"MCP for PADI"' || fail "the web manifest does not name MCP for PADI"
[ "$(curl -fsS --max-time 5 -o /dev/null -w '%{content_type}' "$base/icon-192.png")" = image/png ] || fail "no PNG icon at /icon-192.png"

health=""
for _ in $(seq 1 60); do
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")
  [ "$health" = healthy ] && break
  [ "$health" = unhealthy ] && fail "the Docker health check failed"
  sleep 2
done
[ "$health" = healthy ] || fail "the Docker health check did not pass (status: $health)"

[ "$(docker exec "$name" id -u)" != 0 ] || fail "the container runs as root"
docker exec "$name" test -f /data/master.key || fail "no master key was created in /data"

echo "smoke test passed: $label"
