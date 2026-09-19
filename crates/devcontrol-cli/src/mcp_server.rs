use std::io::{self, BufRead};
use std::fs;
use serde_json::json;
use crate::mcp_protocol::{JsonRpcRequest, response};

fn tools_list() -> serde_json::Value {
    json!({
        "tools":[
            {"name":"fs.list","description":"List workspace files"},
            {"name":"fs.read","description":"Read workspace file"},
            {"name":"fs.write","description":"Write workspace file"},
            {"name":"process.start","description":"Start process"},
            {"name":"process.list","description":"List processes"},
            {"name":"process.stop","description":"Stop process"},
            {"name":"process.logs","description":"Read process logs"}
        ]
    })
}

fn tool_call(params: Option<serde_json::Value>) -> serde_json::Value {
    let Some(params) = params else {
        return json!({"error":"missing params"});
    };

    let name = params.get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match name {
        "fs.list" => {
            let path = params
                .get("arguments")
                .and_then(|v| v.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or(".");

            match fs::read_dir(path) {
                Ok(entries) => {
                    let files: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .filter_map(|e| e.file_name().into_string().ok())
                        .collect();
                    json!({"content": files})
                }
                Err(e) => json!({"error": e.to_string()})
            }
        }
        "fs.read" | "fs.write" |
        "process.start" | "process.list" |
        "process.stop" | "process.logs" => {
            json!({
                "status":"accepted",
                "tool":name,
                "message":"execution binding pending"
            })
        }
        _ => json!({"error":"unknown tool"})
    }
}

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
            "tools/list" => response(req.id, tools_list()),
            "tools/call" => response(req.id, tool_call(req.params)),
            _ => response(req.id, json!({"error":"method not implemented"})),
        };

        println!("{}", output);
    }
}
