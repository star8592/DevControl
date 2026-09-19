use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRecord {
    pub id: u64,
    pub pid: u32,
    pub command: String,
    pub status: String,
}

#[derive(Debug, Default)]
pub struct ProcessRegistry {
    next_id: u64,
    records: Vec<ProcessRecord>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self { next_id: 1, records: Vec::new() }
    }

    pub fn register(&mut self, pid: u32, command: String) -> ProcessRecord {
        let record = ProcessRecord { id: self.next_id, pid, command, status: "running".into() };
        self.next_id += 1;
        self.records.push(record.clone());
        record
    }

    pub fn list(&self) -> &[ProcessRecord] {
        &self.records
    }
}
