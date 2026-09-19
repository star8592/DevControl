use devcontrol_core::process_supervisor;

pub fn run(args: &[String]) {
    if args.first().map(String::as_str) != Some("run") {
        eprintln!("usage: devctl supervisor run <command>");
        std::process::exit(2);
    }

    let command = args.get(1..).unwrap_or(&[]).join(" ");

    match process_supervisor::run(&command) {
        Ok(result) => {
            println!("status={}", result.status);
            println!("exit_code={}", result.exit_code);
            println!("log={}", result.log_path);

            if result.status != "success" {
                std::process::exit(result.exit_code.max(1));
            }
        }
        Err(err) => {
            eprintln!("supervisor error: {err}");
            std::process::exit(1);
        }
    }
}
