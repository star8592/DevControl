use std::path::{Path, PathBuf};

pub fn resolve_inside(root: &Path, requested: &Path) -> Option<PathBuf> {
    let root = root.canonicalize().ok()?;
    let candidate = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root.join(requested)
    };
    let candidate = candidate.canonicalize().ok()?;
    candidate.starts_with(&root).then_some(candidate)
}
