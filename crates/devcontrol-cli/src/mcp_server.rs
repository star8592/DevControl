use std::io::{self, BufRead};

pub fn run_stdio() {
    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };

        match line.trim() {
            "tools/list" => {
                println!("{{\"tools\":[\"fs.list\",\"fs.read\",\"fs.write\",\"process.start\",\"process.list\",\"process.stop\",\"process.logs\"]}}");
            }
            "status" => {
                println!("{{\"status\":\"ready\"}}");
            }
            _ => {
                println!("{{\"error\":\"unknown method\"}}");
            }
        }
    }
}
