mod fs_command;

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
        "fs" => {
            fs_command::run(&args[1..]);
        }
        _ => {
            eprintln!("usage: devctl doctor | fs <list|read|write>");
            std::process::exit(2);
        }
    }
}
