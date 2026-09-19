use std::process::{Child, Command, Stdio};

pub struct ProcessManager {
    child: Option<Child>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self { child: None }
    }

    pub fn start(&mut self, command: &str) -> std::io::Result<u32> {
        let mut parts = command.split_whitespace();
        let program = parts.next().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "empty command")
        })?;

        let child = Command::new(program)
            .args(parts)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let pid = child.id();
        self.child = Some(child);
        Ok(pid)
    }

    pub fn stop(&mut self) -> std::io::Result<()> {
        if let Some(child) = self.child.as_mut() {
            child.kill()?;
        }
        Ok(())
    }
}
