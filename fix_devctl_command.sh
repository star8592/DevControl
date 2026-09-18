#!/usr/bin/env bash
set -e

echo "===== patch devctl command ====="

python3 <<'PY'
from pathlib import Path

p=Path("crates/devcontrol-cli/src/main.rs")

s=p.read_text()

print("Current main.rs length:",len(s))

# 输出备份
Path("crates/devcontrol-cli/src/main.rs.bak").write_text(s)


# 找到命令列表提示位置
if "delivery" not in s:

    s=s.replace(
        '"discover"',
        '"delivery"'
    )


# 简单插入 delivery 处理
if "Delivery" not in s and "delivery::status" not in s:

    s=s.replace(
        "fn main()",
        '''
fn delivery_command(args:&Vec<String>) {

    if args.len() < 3 {
        devcontrol_core::modules::delivery::status();
        return;
    }

    match args[2].as_str() {
        "status" =>
            devcontrol_core::modules::delivery::status(),

        "test" =>
            devcontrol_core::modules::delivery::test(),

        "deploy" =>
            devcontrol_core::modules::delivery::deploy(),

        "rollback" =>
            devcontrol_core::modules::delivery::rollback(),

        _ =>
            devcontrol_core::modules::delivery::status(),
    }
}


fn main()
'''
    )


    s=s.replace(
        'let command = &args[1];',
        '''
let command = &args[1];

if command=="delivery" {
    delivery_command(&args);
    return;
}
'''
    )


p.write_text(s)

PY


cargo build


cp target/debug/devctl ~/.local/bin/devctl


echo ""
echo "===== TEST ====="

~/.local/bin/devctl delivery status || true


echo "===== DONE ====="

