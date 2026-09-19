use crate::{Capability, Request};
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct Policy {
    pub allow_write: bool,
    pub allow_shell: bool,
    pub allow_git_write: bool,
}

impl Default for Policy {
    fn default() -> Self {
        Self { allow_write: false, allow_shell: false, allow_git_write: false }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PolicyError {
    #[error("capability denied by policy: {0:?}")]
    Denied(Capability),
}

impl Policy {
    pub fn authorize(&self, request: &Request) -> Result<(), PolicyError> {
        let allowed = match request.capability {
            Capability::FsRead | Capability::GitRead => true,
            Capability::FsWrite => self.allow_write,
            Capability::ShellExec | Capability::ProcessManage => self.allow_shell,
            Capability::GitWrite => self.allow_git_write,
        };
        allowed.then_some(()).ok_or_else(|| PolicyError::Denied(request.capability.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Request;

    #[test]
    fn default_policy_is_read_only() {
        let policy = Policy::default();
        let read = Request { capability: Capability::FsRead, workspace: ".".into(), operation: "read".into() };
        let write = Request { capability: Capability::FsWrite, workspace: ".".into(), operation: "write".into() };
        assert!(policy.authorize(&read).is_ok());
        assert_eq!(policy.authorize(&write), Err(PolicyError::Denied(Capability::FsWrite)));
    }
}
