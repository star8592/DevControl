use devcontrol_core::{Capability, Policy};
use std::fs;
use std::path::Path;

pub fn run(args: &[String]) {
    let policy = Policy::default();

    match args.first().map(String::as_str) {
        Some("list") => {
            policy.authorize(Capability::FsRead).expect("read capability");
            let path = args.get(1).map(String::as_str).unwrap_or(".");
            match fs::read_dir(path) {
                Ok(entries) => {
                    for entry in entries.flatten() {
                        println!("{}", entry.file_name().to_string_lossy());
                    }
                }
                Err(e) => eprintln!("error: {e}"),
            }
        }
        Some("read") => {
            policy.authorize(Capability::FsRead).expect("read capability");
            if let Some(path) = args.get(1) {
                match fs::read_to_string(Path::new(path)) {
                    Ok(v) => print!("{v}"),
                    Err(e) => eprintln!("error: {e}"),
                }
            }
        }
        _ => eprintln!("usage: devctl fs <list|read>")
    }
}
