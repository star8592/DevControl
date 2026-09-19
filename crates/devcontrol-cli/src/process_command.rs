use devcontrol_core::process::ProcessManager;
use devcontrol_core::process_registry::ProcessRegistry;

pub fn run(args: &[String]) {
    let mut registry = ProcessRegistry::new();

    match args.first().map(String::as_str) {
        Some("start") => {
            let command = args[1..].join(" ");
            let mut manager = ProcessManager::new();
            match manager.start(&command) {
                Ok(pid) => {
                    let record = registry.register(pid, command);
                    println!("process started id={} pid={}", record.id, record.pid);
                }
                Err(e) => eprintln!("error: {e}"),
            }
        }
        Some("list") => {
            for item in registry.list() {
                println!("{} {} {} {}", item.id, item.pid, item.status, item.command);
            }
        }
        Some("stop") => {
            println!("process stop will use registry in next persistence step");
        }
        Some("logs") => {
            println!("process logs will use registry in next persistence step");
        }
        _ => eprintln!("usage: devctl process <start|list|logs|stop>"),
    }
}
