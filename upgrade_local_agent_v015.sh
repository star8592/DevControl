#!/usr/bin/env bash
set -e

echo "===== DevControl Local Agent V0.15 ====="

mkdir -p lib/local-agent
mkdir -p state/doctor

cat > lib/local-agent/environment.mjs <<'JS'
import { execSync } from "node:child_process";

function run(cmd){
  try{
    return execSync(cmd,{encoding:"utf8"}).trim();
  }catch{
    return null;
  }
}

export function collectEnvironment(){

  return {
    os: run("lsb_release -ds") || process.platform,
    kernel: run("uname -r"),
    cpu: run("lscpu | grep 'Model name' | cut -d: -f2")?.trim(),
    memory: run("free -h | awk '/Mem:/ {print $2}'"),
    gpu: run("nvidia-smi --query-gpu=name --format=csv,noheader") ,
    tools:{
      git: !!run("git --version"),
      node: !!run("node --version"),
      npm: !!run("npm --version"),
      rust: !!run("rustc --version"),
      python: !!run("python3 --version"),
      docker: !!run("docker --version")
    }
  };
}
JS


cat > lib/local-agent/git-check.mjs <<'JS'
import {execSync} from "node:child_process";

function run(cmd){
 try{
  return execSync(cmd,{encoding:"utf8"}).trim();
 }catch{
  return null;
 }
}

export function checkGit(){

 return {
   version:run("git --version"),
   remote:run("git remote -v"),
   branch:run("git branch --show-current"),
   status:run("git status --short")
 };

}
JS


cat > lib/local-agent/project-scan.mjs <<'JS'
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
JS


cat > lib/local-agent/index.mjs <<'JS'
import {collectEnvironment} from "./environment.mjs";
import {checkGit} from "./git-check.mjs";
import {scanProjects} from "./project-scan.mjs";

export async function doctor(){

 return {
   time:new Date().toISOString(),
   environment:collectEnvironment(),
   git:checkGit(),
   projects:scanProjects()
 };

}
JS


echo "Files created"

echo "===== locating devctl ====="

grep -q "doctor" scripts/devctl.mjs || {

cat >> scripts/devctl.mjs <<'JS'


// Local Agent Doctor
if(process.argv[2]==="doctor"){

 const {doctor}=await import("../lib/local-agent/index.mjs");

 const result=await doctor();

 console.log(JSON.stringify(result,null,2));

 process.exit(0);
}

JS

}

echo "===== test ====="

node --check lib/local-agent/index.mjs
node --check lib/local-agent/environment.mjs
node --check lib/local-agent/git-check.mjs
node --check lib/local-agent/project-scan.mjs


echo ""
echo "===== DONE ====="
echo "Run:"
echo "devctl doctor"

