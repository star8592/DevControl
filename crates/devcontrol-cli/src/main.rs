use devcontrol_core::{discovery, Capability, Policy};

fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "doctor".into());

    match command.as_str() {
        "doctor" => doctor(),
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

fn doctor() {
    let policy = Policy::default();
    policy
        .authorize(Capability::FsRead)
        .expect("read capability");
    println!("DevControl doctor: OK");
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
    println!("usage: devctl <doctor|discover [path]|status>");
}
