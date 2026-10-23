#!/usr/bin/env bash
# Land one agent batch: journal -> <batch>.json -> backup -> <batch>.sql -> apply -> verify.
#   bash scripts/content-fill/land.sh <batch> <workflow journal.jsonl>
# Revert a batch's menus: DELETE FROM restaurant_menus WHERE notes LIKE 'agent-fill <batch>;%';
# (then re-mark the previous version current if one existed). Column values: <batch>-before.json.
set -euo pipefail
batch="$1"; journal="$2"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"
set -a; . ./.env; set +a
dir=scripts/content-fill
node -e '
const fs=require("fs");
const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(l=>JSON.parse(l))
  .filter(x=>x.type==="result").flatMap(x=>{const v=x.result??x.value??x.output;return (typeof v==="string"?JSON.parse(v):v)?.rows||[]});
if(!rows.length){console.error("no rows in journal");process.exit(1)}
fs.writeFileSync(process.argv[2],JSON.stringify({rows},null,1));
' "$journal" "$dir/$batch.json"
ids=$(node -e 'console.log(require(process.argv[1]).rows.map(r=>"'"'"'"+r.id+"'"'"'").join(","))' "$repo/$dir/$batch.json")
mkdir -p scripts/content-backups/content-fill
out=scripts/content-backups/content-fill/$batch-before.json
[ -e "$out" ] || psql "$SUPABASE_DB_URL" -X -A -t -c "select json_agg(json_build_object('id',id,'website',website,'menu_url',menu_url,'status',status)) from restaurants where id in ($ids)" > "$out"
node $dir/apply.mjs "$batch"
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$dir/$batch.sql"
psql "$SUPABASE_DB_URL" -X -A -t -c "select '$batch landed: ' || count(*) || ' menus, ' || coalesce(sum((select count(*) from restaurant_menu_items i where i.menu_id=m.id)),0) || ' items' from restaurant_menus m where notes like 'agent-fill $batch;%' and is_current"
