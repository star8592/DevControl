use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn next_log_path(dir: &Path) -> PathBuf {
    let mut next_id = 1_u64;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(number) = name
                .strip_prefix("process-")
                .and_then(|s| s.strip_suffix(".log"))
                .and_then(|s| s.parse::<u64>().ok())
            else {
                continue;
            };
            next_id = next_id.max(number + 1);
        }
    }

    dir.join(format!("process-{next_id:03}.log"))
}

pub fn run(args: &[String]) {
    if args.first().map(String::as_str) != Some("run") {
        eprintln!("usage: devctl supervisor run <command>");
        std::process::exit(2);
    }

    let command = args.get(1..).unwrap_or(&[]).join(" ");
    if command.trim().is_empty() {
        eprintln!("usage: devctl supervisor run <command>");
        std::process::exit(2);
    }

    let log_dir = Path::new("state/logs");
    if let Err(err) = fs::create_dir_all(log_dir) {
        eprintln!("failed to create log directory: {err}");
        std::process::exit(1);
    }

    let log_path = next_log_path(log_dir);

    let output = match Command::new("sh").arg("-lc").arg(&command).output() {
        Ok(output) => output,
        Err(err) => {
            eprintln!("failed to run command: {err}");
            std::process::exit(1);
        }
    };

    let exit_code = output.status.code().unwrap_or(-1);
    let status = if output.status.success() {
        "success"
    } else {
        "failed"
    };

    let body = format!(
        "========== COMMAND ==========\n{command}\n\n========== STDOUT ==========\n{}\n========== STDERR ==========\n{}\n========== RESULT ==========\nstatus={status}\nexit_code={exit_code}\n",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    if let Err(err) = fs::write(&log_path, body) {
        eprintln!("failed to write log: {err}");
        std::process::exit(1);
    }

    println!("status={status}");
    println!("exit_code={exit_code}");
    println!("log={}", log_path.display());

    if !output.status.success() {
        std::process::exit(exit_code.max(1));
    }
}
