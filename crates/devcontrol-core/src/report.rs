use serde::Serialize;
use std::path::Path;

use crate::{discovery, doctor};

#[derive(Debug, Serialize)]
pub struct ProjectReport {
    pub path: String,
    pub discovery: discovery::ProjectInfo,
    pub checks: doctor::DoctorReport,
    pub next_steps: Vec<String>,
}

pub fn generate(path: impl AsRef<Path>) -> ProjectReport {
    let path = path.as_ref();
    ProjectReport {
        path: path.display().to_string(),
        discovery: discovery::discover(path),
        checks: doctor::inspect(path),
        next_steps: vec![
            "review project state".into(),
            "run tests".into(),
            "create automation tasks".into(),
        ],
    }
}
