pub mod policy;
pub mod workspace;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Capability {
    FsRead,
    FsWrite,
    ShellExec,
    ProcessManage,
    GitRead,
    GitWrite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub capability: Capability,
    pub workspace: String,
    pub operation: String,
}

pub fn authorize(request: &Request, policy: &policy::Policy) -> Result<(), policy::PolicyError> {
    policy.authorize(request)
}
