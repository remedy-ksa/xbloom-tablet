#!/bin/sh
# One number per release. Writes VERSION in sw.js and every ?v= in index.html, then checks they all match.
#   sh scripts/bump.sh        -> next number
#   sh scripts/bump.sh 30     -> exactly 30
set -e
cd "$(dirname "$0")/.."
cur=$(sed -n 's/^const VERSION = \([0-9]*\);.*/\1/p' sw.js)
new=${1:-$((cur + 1))}
sed -i '' "s/^const VERSION = [0-9]*;/const VERSION = $new;/" sw.js
sed -i '' "s/?v=[0-9]*\"/?v=$new\"/g" index.html
bad=$(grep -o '?v=[0-9]*"' index.html | grep -v "?v=$new\"" || true)
[ -z "$bad" ] || { echo "index.html still has: $bad"; exit 1; }
echo "version $cur -> $new ($(grep -c "?v=$new\"" index.html) links in index.html)"
