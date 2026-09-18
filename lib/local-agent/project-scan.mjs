import fs from "node:fs";
import path from "node:path";

const ROOT="/mnt/disk1/Code";

export function scanProjects(){

 if(!fs.existsSync(ROOT))
   return [];

 return fs.readdirSync(ROOT)
 .filter(x=>{
    const p=path.join(ROOT,x);
    return fs.statSync(p).isDirectory();
 })
 .map(name=>{
    const p=path.join(ROOT,name);

    return {
      name,
      path:p,
      type:
        fs.existsSync(path.join(p,"Cargo.toml"))?
        "rust":
        fs.existsSync(path.join(p,"package.json"))?
        "node":
        fs.existsSync(path.join(p,"project.godot"))?
        "godot":
        "unknown"
    };
 });
}
