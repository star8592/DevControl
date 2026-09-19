use std::{fs, path::{Component, Path, PathBuf}};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FsError {
    #[error("path escapes workspace")]
    OutsideWorkspace,
    #[error("invalid path")]
    InvalidPath,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct WorkspaceFs {
    root: PathBuf,
}

impl WorkspaceFs {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, FsError> {
        Ok(Self { root: root.as_ref().canonicalize()? })
    }

    fn lexical_path(&self, path: impl AsRef<Path>) -> Result<PathBuf, FsError> {
        let path = path.as_ref();
        if path.is_absolute() { return Err(FsError::OutsideWorkspace); }
        let mut clean = PathBuf::new();
        for component in path.components() {
            match component {
                Component::Normal(part) => clean.push(part),
                Component::CurDir => {}
                Component::ParentDir | Component::RootDir | Component::Prefix(_) =>
                    return Err(FsError::OutsideWorkspace),
            }
        }
        Ok(self.root.join(clean))
    }

    fn existing_path(&self, path: impl AsRef<Path>) -> Result<PathBuf, FsError> {
        let candidate = self.lexical_path(path)?;
        let canonical = candidate.canonicalize()?;
        if !canonical.starts_with(&self.root) { return Err(FsError::OutsideWorkspace); }
        Ok(canonical)
    }

    pub fn read_text(&self, path: impl AsRef<Path>) -> Result<String, FsError> {
        Ok(fs::read_to_string(self.existing_path(path)?)?)
    }

    pub fn list(&self, path: impl AsRef<Path>) -> Result<Vec<String>, FsError> {
        let mut out = Vec::new();
        for entry in fs::read_dir(self.existing_path(path)?)? {
            out.push(entry?.file_name().to_string_lossy().into_owned());
        }
        out.sort();
        Ok(out)
    }

    pub fn write_text(&self, path: impl AsRef<Path>, content: &str) -> Result<(), FsError> {
        let candidate = self.lexical_path(path)?;
        let parent = candidate.parent().ok_or(FsError::InvalidPath)?;
        let parent = parent.canonicalize()?;
        if !parent.starts_with(&self.root) { return Err(FsError::OutsideWorkspace); }
        fs::write(candidate, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        let p = std::env::temp_dir().join(format!("devcontrol-fs-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn read_list_write_inside_workspace() {
        let root = temp_root();
        fs::write(root.join("a.txt"), "hello").unwrap();
        let ws = WorkspaceFs::new(&root).unwrap();
        assert_eq!(ws.read_text("a.txt").unwrap(), "hello");
        assert!(ws.list(".").unwrap().contains(&"a.txt".into()));
        ws.write_text("b.txt", "world").unwrap();
        assert_eq!(fs::read_to_string(root.join("b.txt")).unwrap(), "world");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn traversal_is_denied() {
        let root = temp_root();
        let ws = WorkspaceFs::new(&root).unwrap();
        assert!(matches!(ws.read_text("../secret"), Err(FsError::OutsideWorkspace)));
        assert!(matches!(ws.write_text("../secret", "x"), Err(FsError::OutsideWorkspace)));
        fs::remove_dir_all(root).unwrap();
    }
}
