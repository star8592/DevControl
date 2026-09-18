#!/usr/bin/env bash
set -e

echo "===== DevControl Local Final Test ====="

ROOT="/mnt/disk1/Code/DevControl"

cd "$ROOT"

echo
echo "===== 1. Repository ====="
pwd
git status || true

echo
echo "===== 2. Sync ====="
git pull --rebase || true

echo
echo "===== 3. Environment ====="
echo "Rust:"
rustc --version || true

echo "Cargo:"
cargo --version || true

echo "Node:"
node --version || true

echo "NPM:"
npm --version || true


echo
echo "===== 4. Build ====="

if [ -f Cargo.toml ]; then
    cargo build
fi


echo
echo "===== 5. Install devctl ====="

if [ -f target/debug/devctl ]; then
    sudo cp target/debug/devctl /usr/local/bin/devctl
    sudo chmod +x /usr/local/bin/devctl
fi


echo
echo "===== 6. DevControl status ====="

if command -v devctl >/dev/null 2>&1; then
    devctl status || true
    devctl discover || true
else
    echo "devctl binary not installed yet"
fi


echo
echo "===== 7. Project qualification ====="

PROJECTS=(
"/mnt/disk1/Code/CycleAlpha"
"/mnt/disk1/Code/DanDao"
"/mnt/disk1/Code/DaoLife"
"/mnt/disk1/Code/Kangaroo-Practice-Simulator"
"/mnt/disk1/Code/CommerceFlow"
"/mnt/disk1/Code/Industrial-CAD-Agent-v7-web-launcher"
"/mnt/disk1/Code/tidebound"
)

for PROJECT in "${PROJECTS[@]}"
do
    echo
    echo "=========="
    echo "$PROJECT"

    if [ -d "$PROJECT" ]; then

        if command -v devctl >/dev/null 2>&1; then
            devctl qualify "$PROJECT" || true
        fi

    else
        echo "NOT FOUND"
    fi

done


echo
echo "===== FINISHED ====="
