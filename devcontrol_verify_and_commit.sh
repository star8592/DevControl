#!/usr/bin/env bash
set -e

echo "======================================"
echo " DevControl Verify & Commit"
echo "======================================"

ROOT=$(pwd)

echo ""
echo "[1] Current git status"
git status || true


echo ""
echo "[2] Directory structure"

echo "--- lib ---"
find lib -maxdepth 2 -type d | sort || true


echo ""
echo "[3] Check Local Agent"

if [ -d "lib/local-agent" ]; then
    echo "LOCAL_AGENT: FOUND"
else
    echo "LOCAL_AGENT: MISSING"
fi


echo ""
echo "[4] Check Diagnostics"

if [ -d "lib/diagnostics" ]; then
    echo "DIAGNOSTICS: FOUND"
else
    echo "DIAGNOSTICS: MISSING"
fi


echo ""
echo "[5] Syntax check"

for f in $(find lib -name "*.mjs" 2>/dev/null); do
    node --check "$f" || exit 1
done

echo "Syntax PASS"


echo ""
echo "[6] Run doctor"

if command -v devctl >/dev/null 2>&1; then
    devctl doctor || true
else
    echo "devctl command not installed"
fi


echo ""
echo "[7] Run diagnose self"

if command -v devctl >/dev/null 2>&1; then
    devctl diagnose "$ROOT" || true
fi


echo ""
echo "[8] Create state snapshot"

mkdir -p state/snapshots

cat > state/snapshots/latest.json <<JSON
{
 "project":"DevControl",
 "time":"$(date -Iseconds)",
 "local_agent_exists":$([ -d lib/local-agent ] && echo true || echo false),
 "diagnostics_exists":$([ -d lib/diagnostics ] && echo true || echo false)
}
JSON


echo ""
echo "[9] Git add"

git add .


echo ""
echo "[10] Commit"

git commit -m "chore: verify devcontrol local agent foundation" || \
echo "Nothing to commit"


echo ""
echo "[11] Push"

git push || \
echo "Push skipped or failed"


echo ""
echo "======================================"
echo " DONE"
echo "======================================"

