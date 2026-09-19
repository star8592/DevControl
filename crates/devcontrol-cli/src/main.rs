mod fs_command;
mod mcp_command;
mod mcp_protocol;
mod mcp_server;
mod process_command;
mod supervisor_command;

use devcontrol_core::{Capability, Policy};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("doctor");

    match command {
        "doctor" => {
            let policy = Policy::default();
            policy.authorize(Capability::FsRead).expect("read capability");
            println!("DevControl: OK");
        }
        "fs" => fs_command::run(&args[1..]),
        "process" => process_command::run(&args[1..]),
        "supervisor" => supervisor_command::run(&args[1..]),
        "mcp" => mcp_command::run(&args[1..]),
        _ => {
            eprintln!(
                "usage: devctl doctor | fs <list|read|write> | process <start|logs|stop> | supervisor run <command> | mcp <server|tools|status>"
            );
            std::process::exit(2);
        }
    }
}
