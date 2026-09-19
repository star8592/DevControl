mod mcp_server;

use serde_json::json;

pub fn run(args: &[String]) {
    match args.first().map(String::as_str) {
        Some("server") => {
            mcp_server::run_stdio();
        }
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
            eprintln!("usage: devctl mcp <server|tools|status>");
        }
    }
}
