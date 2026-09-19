use devcontrol_core::{Capability, Policy};

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
    println!("DevControl discover: project discovery placeholder");
}

fn status() {
    println!("DevControl status: ready");
}

fn help() {
    println!("usage: devctl <doctor|discover|status>");
}
