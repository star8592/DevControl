use serde_json::json;

pub fn run(args: &[String]) {
    match args.first().map(String::as_str) {
        Some("tools") => {
            println!("{}", json!({
                "tools": [
                    "fs.list",
                    "fs.read",
                    "fs.write",
                    "process.start",
                    "process.list",
                    "process.stop",
                    "process.logs"
                ]
            }));
        }
        Some("status") => {
            println!("{}", json!({"status":"ready"}));
        }
        _ => {
            eprintln!("usage: devctl mcp <tools|status>");
        }
    }
}
