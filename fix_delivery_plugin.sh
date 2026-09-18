#!/usr/bin/env bash
set -e

echo "===== Fix DevControl Delivery Module ====="

ROOT=$(pwd)

mkdir -p crates/devcontrol-core/src/modules


cat > crates/devcontrol-core/src/modules/mod.rs <<'EOF'
pub mod delivery;
EOF


python3 <<'PY'
from pathlib import Path

p=Path("crates/devcontrol-core/src/lib.rs")

s=p.read_text()

if "pub mod modules;" not in s:
    s += "\n\npub mod modules;\n"

p.write_text(s)

PY


echo "===== check lib.rs ====="
cat crates/devcontrol-core/src/lib.rs


echo "===== rebuild ====="

cargo build


echo "===== install ====="

mkdir -p ~/.local/bin

cp target/debug/devctl ~/.local/bin/devctl


export PATH=$HOME/.local/bin:$PATH


echo "===== test ====="

devctl delivery status || true


echo "===== FINISHED ====="

