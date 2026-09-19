use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn record(tool: &str, path: &str, result: &str) -> std::io::Result<()> {
    let dir = Path::new("state/audit");
    create_dir_all(dir)?;

    let file = dir.join("events.jsonl");
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file)?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    writeln!(
        f,
        "{{\"time\":{},\"tool\":\"{}\",\"path\":\"{}\",\"result\":\"{}\"}}",
        ts, tool, path, result
    )?;

    Ok(())
}
