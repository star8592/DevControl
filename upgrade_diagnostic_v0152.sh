#!/usr/bin/env bash
set -e

echo "===== DevControl Diagnostic Engine V0.15.2 ====="

mkdir -p lib/diagnostics
mkdir -p state/diagnostics


cat > lib/diagnostics/runner.mjs <<'JS'
import {execSync} from "node:child_process";

export function runCommand(cmd,cwd){

    const start=Date.now();

    try{

        const output=execSync(
            cmd,
            {
              cwd,
              encoding:"utf8",
              stderr:"pipe",
              timeout:600000
            }
        );

        return {
            command:cmd,
            success:true,
            output,
            duration:Date.now()-start
        };

    }catch(e){

        return {
            command:cmd,
            success:false,
            output:e.stdout?.toString() || "",
            error:e.stderr?.toString() || e.message,
            duration:Date.now()-start
        };
    }
}
JS



cat > lib/diagnostics/project-diagnose.mjs <<'JS'
import fs from "node:fs";
import path from "node:path";
import {runCommand} from "./runner.mjs";


function detectType(project){

    if(fs.existsSync(path.join(project,"Cargo.toml")))
        return "rust";

    if(fs.existsSync(path.join(project,"package.json")))
        return "node";

    if(fs.existsSync(path.join(project,"project.godot")))
        return "godot";

    if(fs.existsSync(path.join(project,"requirements.txt")))
        return "python";

    return "unknown";
}


export function diagnoseProject(project){

    const type=detectType(project);

    let result={
        project,
        type,
        timestamp:new Date().toISOString()
    };


    switch(type){

        case "rust":
            result.check=
              runCommand("cargo check",project);
            break;


        case "node":
            result.check=
              runCommand("npm run check",project);
            break;


        case "python":
            result.check=
              runCommand("pytest",project);
            break;


        case "godot":
            result.check=
              runCommand(
                "godot --headless --quit",
                project
              );
            break;


        default:
            result.check={
              success:null,
              error:"Unknown project type"
            };
    }


    return result;
}
JS



cat > lib/diagnostics/failure-packet.mjs <<'JS'

export function createFailurePacket(result){

    return {

        project:result.project,

        status:
          result.check.success?
          "PASS":
          "FAILED",

        type:result.type,

        evidence:{
          command:
            result.check.command,

          error:
            result.check.error || null,

          output:
            result.check.output?.slice(0,3000)
        },

        timestamp:
          result.timestamp
    };

}

JS



cat > lib/diagnostics/index.mjs <<'JS'

import fs from "node:fs";
import path from "node:path";
import {diagnoseProject} from "./project-diagnose.mjs";
import {createFailurePacket} from "./failure-packet.mjs";


export function diagnose(project){

    const result=diagnoseProject(project);

    const packet=createFailurePacket(result);


    const dir=
      path.join(
        "state",
        "diagnostics",
        path.basename(project)
      );


    fs.mkdirSync(dir,{recursive:true});


    fs.writeFileSync(
      path.join(dir,"latest.json"),
      JSON.stringify(packet,null,2)
    );


    return packet;

}

JS



echo "Adding CLI command"


cat >> scripts/devctl.mjs <<'JS'


if(process.argv[2]==="diagnose"){

 const {diagnose}=await import("../lib/diagnostics/index.mjs");

 const project=
   process.argv[3] ||
   process.cwd();


 console.log(
   JSON.stringify(
     diagnose(project),
     null,
     2
   )
 );

 process.exit(0);
}

JS



echo "checking syntax"

node --check lib/diagnostics/index.mjs
node --check lib/diagnostics/project-diagnose.mjs
node --check lib/diagnostics/runner.mjs

echo ""
echo "===== Diagnostic Engine Installed ====="

echo ""
echo "Test:"
echo "devctl diagnose /path/to/project"

