use devcontrol_core::process::ProcessManager;

pub fn run(args: &[String]) {
    match args.first().map(String::as_str) {
        Some("start") => {
            let command = args[1..].join(" ");
            let mut manager = ProcessManager::new();
            match manager.start(&command) {
                Ok(pid) => println!("process started: {pid}"),
                Err(e) => eprintln!("error: {e}"),
            }
        }
        Some("stop") => {
            println!("process stop requires session storage in next iteration");
        }
        Some("logs") => {
            println!("process logs requires session storage in next iteration");
        }
        _ => eprintln!("usage: devctl process <start|logs|stop>"),
    }
}
