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
