#!/usr/bin/env bash
set -e

ROOT="$(pwd)"

echo "===== DevControl Delivery Auto Upgrade ====="

mkdir -p crates/devcontrol-core/src/modules


cat > crates/devcontrol-core/src/modules/mod.rs <<'EOF'
pub mod delivery;
EOF


cat > crates/devcontrol-core/src/modules/delivery.rs <<'EOF'
use std::process::Command;

fn ssh(cmd:&str)->String{

    let out = Command::new("ssh")
        .arg("root@lic.toktik.tech")
        .arg(cmd)
        .output();

    match out {
        Ok(v)=>{
            format!(
                "{}{}",
                String::from_utf8_lossy(&v.stdout),
                String::from_utf8_lossy(&v.stderr)
            )
        },
        Err(e)=>{
            format!("error {}",e)
        }
    }
}


pub fn status(){

    println!("===== Delivery Status =====");

    println!("{}",ssh(
        "systemctl is-active commerceflow-delivery"
    ));

    println!("{}",ssh(
        "curl -s http://127.0.0.1:18120/health"
    ));
}


pub fn test(){

    println!("===== Delivery Smoke Test =====");

    println!("{}",ssh(
        "curl -s http://127.0.0.1:18120/health"
    ));
}


pub fn deploy(){

    println!("===== Delivery Deploy =====");

    println!("{}",ssh(
        "systemctl restart commerceflow-delivery && systemctl is-active commerceflow-delivery"
    ));
}


pub fn rollback(){

    println!("===== Delivery Rollback =====");

    println!("{}",ssh(
        "ls /opt/commerceflow-delivery/releases | tail"
    ));
}
EOF


python3 <<'PY'
from pathlib import Path

p=Path("crates/devcontrol-cli/src/main.rs")

s=p.read_text()

if "delivery" not in s:

    s=s.replace(
        "use devcontrol_core",
        "use devcontrol_core::modules::delivery;\nuse devcontrol_core"
    )


marker='match command.as_str() {'

if marker in s and '"delivery"' not in s:

    s=s.replace(
        marker,
        marker+'''
        "delivery" => {
            if args.len()<2 {
                delivery::status();
            } else {
                match args[1].as_str(){
                    "status"=>delivery::status(),
                    "test"=>delivery::test(),
                    "deploy"=>delivery::deploy(),
                    "rollback"=>delivery::rollback(),
                    _=>delivery::status()
                }
            }
        },
'''
    )


p.write_text(s)

PY


cargo build


mkdir -p ~/.local/bin

cp target/debug/devctl ~/.local/bin/devctl


echo 'export PATH=$HOME/.local/bin:$PATH' >> ~/.bashrc


echo ""
echo "===== DONE ====="

devctl delivery status || true

