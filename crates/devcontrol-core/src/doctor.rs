use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DoctorReport {
    pub path: String,
    pub git: bool,
    pub cargo: bool,
    pub package_json: bool,
    pub pyproject: bool,
}

pub fn inspect(path: impl AsRef<Path>) -> DoctorReport {
    let path = path.as_ref();
    DoctorReport {
        path: path.display().to_string(),
        git: path.join(".git").exists(),
        cargo: path.join("Cargo.toml").exists(),
        package_json: path.join("package.json").exists(),
        pyproject: path.join("pyproject.toml").exists(),
    }
}
