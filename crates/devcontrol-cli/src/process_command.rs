use devcontrol_core::process::ProcessManager;
use devcontrol_core::process_registry::ProcessRecord;
use devcontrol_core::process_store::ProcessStore;
use std::path::Path;
use std::process::Command;

const STORE: &str = "state/processes.json";
const LOG_DIR: &str = "state/logs";

pub fn run(args: &[String]) {
    let path = Path::new(STORE);
    let mut store = ProcessStore::load(path);

    match args.first().map(String::as_str) {
        Some("start") => {
            let command = args[1..].join(" ");
            let mut manager = ProcessManager::new();
            match manager.start(&command) {
                Ok(pid) => {
                    let record = ProcessRecord {
                        id: store.processes.len() as u64 + 1,
                        pid,
                        command,
                        status: "running".to_string(),
                    };
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
            let id = args.get(1).and_then(|v| v.parse::<u64>().ok());
            match id.and_then(|x| store.processes.iter_mut().find(|p| p.id == x)) {
                Some(item) => {
                    let _ = Command::new("kill").arg(item.pid.to_string()).status();
                    item.status = "stopped".to_string();
                    store.save(path).expect("save process store");
                    println!("process stopped id={}", item.id);
                }
                None => eprintln!("process not found"),
            }
        }
        Some("logs") => {
            let id = args.get(1).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
            let log = Path::new(LOG_DIR).join(format!("process-{id}.log"));
            match std::fs::read_to_string(log) {
                Ok(content) => print!("{content}"),
                Err(_) => println!("no logs available"),
            }
        }
        _ => eprintln!("usage: devctl process <start|list|logs|stop>"),
    }
}
