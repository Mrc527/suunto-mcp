#!/usr/bin/env bash
# Runner side of the deploy, used by .github/workflows/ci.yml.
#
#   ssh-deploy.sh setup                          write the SSH key, pinned host key and config,
#                                                then check that the server answers
#   ssh-deploy.sh deploy <image>@<digest> <rev>  copy deploy/server to the server and run
#                                                deploy.sh there
#   ssh-deploy.sh rollback                       run "deploy.sh rollback" on the server
#   ssh-deploy.sh check-url <https://host>       wait until the public URL serves this app
#
# Settings come from environment variables:
#   DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS   (secrets) private key and output of ssh-keyscan
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_PORT, DEPLOY_PATH
#   REGISTRY_USER, REGISTRY_TOKEN        short-lived login the server uses to pull the image
set -euo pipefail

IMAGE_RE='^[a-z0-9][a-z0-9._:/-]*@sha256:[0-9a-f]{64}$'

# One-line error annotation in the GitHub log, then stop.
fail() {
  local msg=${1//$'\n'/ }
  echo "::error title=Deploy::$msg"
  exit 1
}

ssh_target() { ssh -F "${DEPLOY_SSH_CONFIG:?run setup first}" deploy-target "$@"; }

remote_dir() {
  local dir=${DEPLOY_PATH:-padi-mcp}
  dir=${dir#\~/}
  [[ $dir =~ ^[A-Za-z0-9._/-]+$ ]] || fail "DEPLOY_PATH may only contain letters, digits and . _ / - (got: $dir)"
  printf '%s' "$dir"
}

# Output from the server is not trusted: stop GitHub from reading workflow commands in it.
run_untrusted() {
  local token rc=0
  token=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  echo "::stop-commands::$token"
  "$@" || rc=$?
  # Start on a new line in case the server output did not end with one.
  printf '\n::%s::\n' "$token"
  return "$rc"
}

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"; fi
}

# Read "public url: https://..." from the server log and expose it as the step output "url".
export_url() {
  local url
  url=$(sed -n 's#^\[deploy\] public url: \(https://[A-Za-z0-9.-]*\(:[0-9]*\)\{0,1\}\)$#\1#p' "$1" | tail -n 1)
  if [ -n "$url" ]; then
    if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "url=$url" >>"$GITHUB_OUTPUT"; fi
    summary "- Public URL: $url (MCP endpoint: $url/mcp)"
  else
    echo "::warning title=Deploy::The server did not report its public URL, so the public check is skipped."
  fi
}

cmd_setup() {
  local host=${DEPLOY_HOST:-} user=${DEPLOY_USER:-} port=${DEPLOY_PORT:-22} dir lookup out="" attempt
  [ -n "${DEPLOY_SSH_KEY:-}" ] || fail "The secret DEPLOY_SSH_KEY is not set. See 'Deploy with GitHub Actions' in README.md."
  [ -n "${DEPLOY_KNOWN_HOSTS:-}" ] || fail "The secret DEPLOY_KNOWN_HOSTS is not set. See 'Deploy with GitHub Actions' in README.md."
  [[ $host =~ ^[A-Za-z0-9.-]+$ ]] || fail "DEPLOY_HOST is not a valid host name: '$host'"
  [[ $user =~ ^[A-Za-z0-9._][A-Za-z0-9._-]*$ ]] || fail "DEPLOY_USER is not a valid user name: '$user'"
  [[ $port =~ ^[0-9]{1,5}$ ]] || fail "DEPLOY_PORT is not a port number: '$port'"

  dir="${RUNNER_TEMP:?}/deploy-ssh"
  rm -rf "$dir"
  mkdir -m 700 "$dir"
  (
    umask 077
    printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' >"$dir/id_deploy"
    printf '%s\n' "$DEPLOY_KNOWN_HOSTS" | tr -d '\r' >"$dir/known_hosts"
  )
  ssh-keygen -y -P '' -f "$dir/id_deploy" >/dev/null 2>&1 ||
    fail "DEPLOY_SSH_KEY is not a valid private key, or it has a passphrase (use a key without one)."
  lookup=$host
  if [ "$port" != 22 ]; then lookup="[$host]:$port"; fi
  ssh-keygen -F "$lookup" -f "$dir/known_hosts" >/dev/null 2>&1 ||
    fail "DEPLOY_KNOWN_HOSTS has no host key for $lookup. Save the output of: ssh-keyscan -p $port $host (and check its fingerprint)."

  cat >"$dir/config" <<EOF
Host deploy-target
  HostName $host
  Port $port
  User $user
  IdentityFile "$dir/id_deploy"
  IdentitiesOnly yes
  IdentityAgent none
  UserKnownHostsFile "$dir/known_hosts"
  GlobalKnownHostsFile /dev/null
  StrictHostKeyChecking yes
  UpdateHostKeys no
  CheckHostIP no
  BatchMode yes
  ConnectTimeout 20
  ServerAliveInterval 15
  ServerAliveCountMax 8
  LogLevel ERROR
EOF
  chmod 600 "$dir/config"
  export DEPLOY_SSH_CONFIG="$dir/config"
  if [ -n "${GITHUB_ENV:-}" ]; then echo "DEPLOY_SSH_CONFIG=$DEPLOY_SSH_CONFIG" >>"$GITHUB_ENV"; fi

  for attempt in 1 2 3; do
    if out=$(ssh_target 'echo connected' 2>&1 </dev/null); then
      echo "SSH connection to $user@$host:$port works."
      return 0
    fi
    echo "SSH attempt $attempt failed: ${out//$'\n'/ }"
    case $out in
      *"Host key verification failed"* | *"Permission denied"* | *"REMOTE HOST IDENTIFICATION HAS CHANGED"*) break ;;
    esac
    sleep $((attempt * 10))
  done
  case $out in
    *"Host key verification failed"* | *"IDENTIFICATION HAS CHANGED"*)
      fail "The server's host key does not match DEPLOY_KNOWN_HOSTS. If you changed the server, update the secret with fresh ssh-keyscan output." ;;
    *"Permission denied"*)
      fail "The server refused the key. Add the public key of DEPLOY_SSH_KEY to ~$user/.ssh/authorized_keys on $host." ;;
    *) fail "Cannot connect to $user@$host:$port: $out" ;;
  esac
}

cmd_deploy() {
  local image=${1:-} revision=${2:-} dir log rc=0
  [[ $image =~ $IMAGE_RE ]] || fail "Invalid image reference: '$image'"
  [[ $revision =~ ^[A-Za-z0-9._-]{1,80}$ ]] || fail "Invalid revision: '$revision'"
  dir=$(remote_dir)

  echo "Copying deploy/server to $DEPLOY_HOST:$dir"
  tar -C deploy/server -cf - compose.yml deploy.sh .env.example |
    run_untrusted ssh_target "mkdir -p -- '$dir' && tar -xf - -C '$dir'" ||
    fail "Could not copy the deploy files to the server."

  echo "Running deploy.sh on the server"
  log=$(mktemp)
  printf '%s\n%s\n' "${REGISTRY_USER:-}" "${REGISTRY_TOKEN:-}" |
    run_untrusted ssh_target "cd -- '$dir' && bash ./deploy.sh deploy '$image' '$revision'" 2>&1 | tee "$log" || rc=$?
  summary "### Deploy to $DEPLOY_HOST" "- Image: \`$image\`" "- Revision: \`$revision\`"
  export_url "$log"
  rm -f "$log"
  if [ "$rc" -eq 255 ]; then
    summary "- Result: **unknown**, the SSH connection was lost"
    fail "Lost the SSH connection during the deploy. The server finishes the deploy on its own: check './deploy.sh status' and .deploy/deploy.log there, or run the workflow again."
  fi
  if [ "$rc" -ne 0 ]; then
    summary "- Result: **failed** (see the job log; the server keeps or restores the previous version)"
    fail "The deploy failed on the server (exit code $rc). See the log above."
  fi
  summary "- Result: deployed and healthy"
}

cmd_rollback() {
  local dir log rc=0
  dir=$(remote_dir)
  log=$(mktemp)
  printf '%s\n%s\n' "${REGISTRY_USER:-}" "${REGISTRY_TOKEN:-}" |
    run_untrusted ssh_target "cd -- '$dir' && bash ./deploy.sh rollback" 2>&1 | tee "$log" || rc=$?
  summary "### Rollback on $DEPLOY_HOST"
  export_url "$log"
  rm -f "$log"
  [ "$rc" -ne 255 ] || fail "Lost the SSH connection during the rollback. The server finishes it on its own: check './deploy.sh status' there."
  [ "$rc" -eq 0 ] || fail "The rollback failed on the server (exit code $rc). See the log above."
  summary "- Result: the previous version is running"
}

cmd_check_url() {
  local url=${1%/} body="" meta issuer attempt
  [[ $url =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || fail "Not a public https URL: '$url'"
  for attempt in $(seq 1 12); do
    body=$(curl -fsS --max-time 10 "$url/healthz" 2>&1) || true
    # The answer comes from the internet: print it on one short line only.
    body=${body//$'\n'/ }
    body=${body:0:300}
    if jq -e '.status == "ok"' >/dev/null 2>&1 <<<"$body"; then
      meta=$(curl -fsS --max-time 10 "$url/.well-known/oauth-authorization-server") ||
        fail "$url/healthz works but the OAuth metadata does not. Check the reverse proxy."
      issuer=$(jq -r '.issuer // empty' <<<"$meta")
      [ "${issuer%/}" = "$url" ] ||
        fail "$url answers with OAuth issuer '$issuer'. The reverse proxy may forward this host name to another service."
      echo "$url is up: $body"
      summary "- Public check: $url/healthz answers"
      return 0
    fi
    echo "Attempt $attempt: $url/healthz is not answering yet ($body)"
    sleep 5
  done
  fail "The service runs on the server, but $url/healthz does not answer from the internet. Check DNS, the firewall and the reverse proxy for this host name."
}

cmd=${1:-}
if [ $# -gt 0 ]; then shift; fi
case $cmd in
  setup) cmd_setup ;;
  deploy) cmd_deploy "$@" ;;
  rollback) cmd_rollback ;;
  check-url) cmd_check_url "$@" ;;
  *)
    echo "usage: ssh-deploy.sh setup | deploy <image>@<digest> <revision> | rollback | check-url <url>" >&2
    exit 2
    ;;
esac
