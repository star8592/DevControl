
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

