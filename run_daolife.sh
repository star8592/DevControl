#!/usr/bin/env bash

set -e

ROOT=/mnt/disk1/Code/DaoLife

echo "=============================="
echo " DaoLife Qualification"
echo "=============================="


echo "[1] Project"

test -d "$ROOT" && echo "PASS"


echo "[2] Cargo"

cd "$ROOT"

cargo check


echo "[3] Build"

cargo build


echo "[4] GPU"

nvidia-smi \
--query-gpu=name,memory.used,utilization.gpu,temperature.gpu \
--format=csv


echo "=============================="
echo " COMPLETE"
echo "=============================="

