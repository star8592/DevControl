use devcontrol_core::{Capability, Policy};

fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "doctor".into());
    match command.as_str() {
        "doctor" => {
            let policy = Policy::default();
            policy
                .authorize(Capability::FsRead)
                .expect("read capability");
            println!("DevControl: OK");
        }
        _ => {
            eprintln!("usage: devctl doctor");
            std::process::exit(2);
        }
    }
}
