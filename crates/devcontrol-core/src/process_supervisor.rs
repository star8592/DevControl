use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct SupervisorResult {
    pub status: String,
    pub exit_code: i32,
    pub log_path: String,
}

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

pub fn run(command: &str) -> io::Result<SupervisorResult> {
    if command.trim().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "command must not be empty",
        ));
    }

    let log_dir = Path::new("state/logs");
    fs::create_dir_all(log_dir)?;

    let log_path = next_log_path(log_dir);
    let output = Command::new("sh").arg("-lc").arg(command).output()?;

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

    fs::write(&log_path, body)?;

    Ok(SupervisorResult {
        status: status.to_string(),
        exit_code,
        log_path: log_path.display().to_string(),
    })
}
