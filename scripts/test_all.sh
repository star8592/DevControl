#!/usr/bin/env bash
set -e

echo "===== DevControl Test ====="

cargo fmt --check
cargo check
cargo test
cargo build

echo "===== ALL PASS ====="
