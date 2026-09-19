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
        Self {
            fs_write: false,
            shell_exec: false,
            process_manage: false,
            git_write: false,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_policy_is_read_only() {
        let policy = Policy::default();
        assert!(policy.authorize(Capability::FsRead).is_ok());
        assert!(policy.authorize(Capability::GitRead).is_ok());
        assert_eq!(
            policy.authorize(Capability::FsWrite),
            Err(PolicyError::Denied(Capability::FsWrite))
        );
        assert_eq!(
            policy.authorize(Capability::ShellExec),
            Err(PolicyError::Denied(Capability::ShellExec))
        );
    }
}
