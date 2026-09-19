use devcontrol_core::{discovery, doctor, Capability, Policy};

fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "doctor".into());

    match command.as_str() {
        "doctor" => doctor_cmd(),
        "discover" => discover(),
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
    let report = doctor::inspect(path);
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}

fn discover() {
    let path = std::env::args().nth(2).unwrap_or_else(|| ".".into());
    let info = discovery::discover(path);
    println!("{}", serde_json::to_string_pretty(&info).unwrap());
}

fn status() {
    println!("DevControl status: ready");
}

fn help() {
    println!("usage: devctl <doctor [path]|discover [path]|status>");
}
