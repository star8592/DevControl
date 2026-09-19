use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ProjectInfo {
    pub path: String,
    pub rust: bool,
    pub node: bool,
    pub python: bool,
    pub git: bool,
}

pub fn discover(path: impl AsRef<Path>) -> ProjectInfo {
    let path = path.as_ref();

    ProjectInfo {
        path: path.display().to_string(),
        rust: path.join("Cargo.toml").exists(),
        node: path.join("package.json").exists(),
        python: path.join("pyproject.toml").exists() || path.join("requirements.txt").exists(),
        git: path.join(".git").exists(),
    }
}
