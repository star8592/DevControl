use std::io::{self, BufRead};
use serde_json::json;
use crate::mcp_protocol::{JsonRpcRequest, response};

pub fn run_stdio() {
    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let Ok(req) = serde_json::from_str::<JsonRpcRequest>(&line) else {
            continue;
        };

        let output = match req.method.as_str() {
            "initialize" => response(req.id, json!({
                "protocolVersion":"2025-06-18",
                "capabilities":{"tools":{"listChanged":true}},
                "serverInfo":{"name":"devcontrol","version":"0.3.0"}
            })),
            "tools/list" => response(req.id, json!({
                "tools":[
                    {"name":"fs.list"},
                    {"name":"fs.read"},
                    {"name":"fs.write"},
                    {"name":"process.start"},
                    {"name":"process.list"},
                    {"name":"process.stop"},
                    {"name":"process.logs"}
                ]
            })),
            _ => response(req.id, json!({"error":"method not implemented"})),
        };

        println!("{}", output);
    }
}
