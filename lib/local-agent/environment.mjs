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
