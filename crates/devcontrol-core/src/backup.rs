use std::fs;
use std::path::{Path, PathBuf};

/// Create a simple workspace backup before destructive writes.
pub fn backup_file(source: &Path, backup_root: &Path) -> std::io::Result<Option<PathBuf>> {
    if !source.exists() {
        return Ok(None);
    }

    let name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    fs::create_dir_all(backup_root)?;

    let mut target = backup_root.join(&name);
    let mut index = 1;
    while target.exists() {
        target = backup_root.join(format!("{}.{}", name, index));
        index += 1;
    }

    fs::copy(source, &target)?;
    Ok(Some(target))
}
