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
