use devcontrol_core::process::ProcessManager;
use devcontrol_core::process_registry::ProcessRegistry;
use devcontrol_core::process_store::ProcessStore;
use std::path::Path;

const STORE: &str = "state/processes.json";

pub fn run(args: &[String]) {
    let path = Path::new(STORE);
    let mut store = ProcessStore::load(path);

    match args.first().map(String::as_str) {
        Some("start") => {
            let command = args[1..].join(" ");
            let mut manager = ProcessManager::new();
            match manager.start(&command) {
                Ok(pid) => {
                    let mut registry = ProcessRegistry::new();
                    let record = registry.register(pid, command);
                    store.processes.push(record.clone());
                    store.save(path).expect("save process store");
                    println!("process started id={} pid={}", record.id, record.pid);
                }
                Err(e) => eprintln!("error: {e}"),
            }
        }
        Some("list") => {
            for item in &store.processes {
                println!("{} {} {} {}", item.id, item.pid, item.status, item.command);
            }
        }
        Some("stop") => {
            println!("process stop persistence hook ready");
        }
        Some("logs") => {
            println!("process logs persistence hook ready");
        }
        _ => eprintln!("usage: devctl process <start|list|logs|stop>"),
    }
}
