pub mod process;
pub mod process_session;
pub mod process_registry;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Capability {
    FsRead,
    FsWrite,
    ShellExec,
    ProcessManage,
    GitRead,
    GitWrite,
}

#[derive(Debug, Clone)]
pub struct Policy {
    pub fs_write: bool,
    pub shell_exec: bool,
    pub process_manage: bool,
    pub git_write: bool,
}

impl Default for Policy {
    fn default() -> Self {
        Self { fs_write: false, shell_exec: false, process_manage: false, git_write: false }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PolicyError {
    #[error("capability denied: {0:?}")]
    Denied(Capability),
}

impl Policy {
    pub fn authorize(&self, capability: Capability) -> Result<(), PolicyError> {
        let allowed = match capability {
            Capability::FsRead | Capability::GitRead => true,
            Capability::FsWrite => self.fs_write,
            Capability::ShellExec => self.shell_exec,
            Capability::ProcessManage => self.process_manage,
            Capability::GitWrite => self.git_write,
        };
        allowed.then_some(()).ok_or(PolicyError::Denied(capability))
    }
}
