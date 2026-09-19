use serde::Serialize;
use std::{fs::OpenOptions, io::Write, path::Path};
use thiserror::Error;

#[derive(Debug, Serialize)]
pub struct AuditEvent<'a> {
    pub capability: &'a str,
    pub operation: &'a str,
    pub target: &'a str,
    pub outcome: &'a str,
}

#[derive(Debug, Error)]
pub enum AuditError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub fn append(path: impl AsRef<Path>, event: &AuditEvent<'_>) -> Result<(), AuditError> {
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    serde_json::to_writer(&mut file, event)?;
    file.write_all(b"\n")?;
    Ok(())
}
