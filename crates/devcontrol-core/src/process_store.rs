use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::process_registry::ProcessRecord;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStore {
    pub processes: Vec<ProcessRecord>,
}

impl ProcessStore {
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or(Self { processes: vec![] }),
            Err(_) => Self { processes: vec![] },
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(self).unwrap();
        fs::write(path, data)
    }
}
