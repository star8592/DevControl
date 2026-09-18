import {doctor} from "../local-agent/index.mjs";
import {diagnose} from "../diagnostics/index.mjs";
import fs from "node:fs";
import path from "node:path";


export async function localStatus(){

    return await doctor();

}


export async function localDiagnose(project){

    if(!project){
        throw new Error("project required");
    }

    return diagnose(project);

}


export async function localLogs(project){

    const candidates=[

        path.join(project,"logs"),
        path.join(project,"log"),
        path.join(project,"*.log")

    ];

    const result=[];


    for(const p of candidates){

        if(fs.existsSync(p)){

            result.push({
                path:p,
                type:
                fs.statSync(p).isDirectory()
                ?"directory"
                :"file"
            });

        }

    }


    return {
        project,
        logs:result
    };

}
