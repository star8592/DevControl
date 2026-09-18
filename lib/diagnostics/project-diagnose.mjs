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
