mod fs_command;

use devcontrol_core::{discovery, doctor, report, Capability, Policy};

fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "doctor".into());

    match command.as_str() {
        "doctor" => doctor_cmd(),
        "discover" => discover(),
        "report" => report_cmd(),
        "fs" => fs_command::run(&std::env::args().skip(2).collect::<Vec<_>>()),
        "status" => status(),
        "help" | "--help" | "-h" => help(),
        _ => {
            eprintln!("unknown command: {command}");
            help();
            std::process::exit(2);
        }
    }
}

fn doctor_cmd() {
    let policy = Policy::default();
    policy.authorize(Capability::FsRead).expect("read capability");
    let path = std::env::args().nth(2).unwrap_or_else(|| ".".into());
    let result = doctor::inspect(path);
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}

fn discover() {
    let path = std::env::args().nth(2).unwrap_or_else(|| ".".into());
    let result = discovery::discover(path);
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}

fn report_cmd() {
    let path = std::env::args().nth(2).unwrap_or_else(|| ".".into());
    let result = report::generate(path);
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}

fn status() {
    println!("DevControl status: ready");
}

fn help() {
    println!("usage: devctl <doctor|discover|report|fs|status>");
}
