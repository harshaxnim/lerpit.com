#!/usr/bin/env bash
# Deploys the lerpit-stats Worker through the Cloudflare REST API (no wrangler needed) and
# attaches it to stats.lerpit.com. Safe to rerun: both calls are PUTs.
#
# Needs ~/.cloudflare/api-token with Workers Scripts Edit, Workers Routes Edit, Zone Read
# and Account Analytics Read. The token is read from the file and never printed; it goes
# to the Worker as its CF_API_TOKEN secret.
set -euo pipefail
cd "$(dirname "$0")"

ACCOUNT_ID=03c4f9649fce0bb609deb92b5d48de54
ZONE_ID=310fc767ebaba5da4b9ba0ded41126c5 # lerpit.com
SITE_TAG=914dce54f3704511adf18dc6c9d668f0
TOKEN_FILE=~/.cloudflare/api-token
API=https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID
T=$(cat "$TOKEN_FILE")

report() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(sys.argv[1], "ok" if d.get("success") else d.get("errors"))' "$1"; }

META=$(python3 -c 'import json,sys; print(json.dumps({"main_module": "worker.js", "compatibility_date": "2026-10-01", "bindings": [
  {"type": "plain_text", "name": "ACCOUNT_ID", "text": sys.argv[2]},
  {"type": "plain_text", "name": "SITE_TAG", "text": sys.argv[3]},
  {"type": "secret_text", "name": "CF_API_TOKEN", "text": open(sys.argv[1]).read().strip()}]}))' "$TOKEN_FILE" "$ACCOUNT_ID" "$SITE_TAG")

curl -s -X PUT -H "Authorization: Bearer $T" "$API/workers/scripts/lerpit-stats" \
  -F "metadata=$META;type=application/json" -F "worker.js=@worker.js;type=application/javascript+module" | report "worker:"

curl -s -X PUT -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$API/workers/domains" \
  -d "{\"environment\":\"production\",\"hostname\":\"stats.lerpit.com\",\"service\":\"lerpit-stats\",\"zone_id\":\"$ZONE_ID\"}" | report "stats.lerpit.com:"
