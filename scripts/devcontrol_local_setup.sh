#!/usr/bin/env bash
set -e

ROOT="/mnt/disk1/Code/DevControl"

echo "========== DevControl Local Setup =========="

cd "$ROOT"

echo ""
echo "[1] Git"
git status
git branch --show-current

echo ""
echo "[2] Rust Files"
find . \
  \( -name "Cargo.toml" -o -name "*.rs" \) \
  | sort

echo ""
echo "[3] Rust Version"
rustc --version
cargo --version

echo ""
echo "[4] Cargo Check"
cargo check

echo ""
echo "[5] Cargo Test"
cargo test

echo ""
echo "[6] Cargo Build"
cargo build

echo ""
echo "[7] Binary"
find target/debug -maxdepth 1 -type f -executable 2>/dev/null || true

echo ""
echo "========== DONE =========="
