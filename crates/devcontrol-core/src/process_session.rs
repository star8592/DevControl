use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessSession {
    pub id: u64,
    pub pid: u32,
    pub command: String,
    pub status: String,
}

impl ProcessSession {
    pub fn running(id: u64, pid: u32, command: String) -> Self {
        Self {
            id,
            pid,
            command,
            status: "running".to_string(),
        }
    }
}
