use devcontrol_core::{authorize, policy::Policy, Capability, Request};

fn main() {
    let command = std::env::args().nth(1).unwrap_or_else(|| "capabilities".into());
    match command.as_str() {
        "capabilities" => {
            println!("{}", serde_json::json!({
                "runtime": "rust",
                "capabilities": ["fs.read","fs.write","shell.exec","process.manage","git.read","git.write"],
                "default_policy": "read-only"
            }));
        }
        "doctor" => {
            let req = Request { capability: Capability::FsRead, workspace: ".".into(), operation: "doctor".into() };
            match authorize(&req, &Policy::default()) {
                Ok(()) => println!("DevControl Rust control plane: OK"),
                Err(err) => { eprintln!("{err}"); std::process::exit(1); }
            }
        }
        _ => {
            eprintln!("usage: devctl-rs [doctor|capabilities]");
            std::process::exit(2);
        }
    }
}
