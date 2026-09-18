#!/usr/bin/env bash
set -e

echo "================================"
echo " DevControl MCP Debug Bridge"
echo "================================"

mkdir -p lib/mcp
mkdir -p state/logs


echo "[1] Create local debug adapter"


cat > lib/mcp/local-debug-adapter.mjs <<'JS'
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
JS


echo "[2] Add MCP debug tools"


if [ -f lib/mcp-tool-contract.mjs ]; then

cat >> lib/mcp-tool-contract.mjs <<'JS'


export const localDebugTools = [

{
 name:"local_status",
 description:
 "Get local DevControl environment and project status"
},

{
 name:"local_diagnose",
 description:
 "Run automatic diagnosis for local project"
},

{
 name:"local_logs",
 description:
 "Collect project log information"
}

];

JS

else

echo "mcp-tool-contract.mjs not found, skip"

fi



echo "[3] Add CLI debug commands"


if [ -f scripts/devctl.mjs ]; then


cat >> scripts/devctl.mjs <<'JS'


if(process.argv[2]==="local-status"){

 const {localStatus}=await import("../lib/mcp/local-debug-adapter.mjs");

 console.log(
 JSON.stringify(
 await localStatus(),
 null,
 2
 )
 );

 process.exit(0);
}


if(process.argv[2]==="local-diagnose"){

 const {localDiagnose}=await import("../lib/mcp/local-debug-adapter.mjs");

 console.log(
 JSON.stringify(
 await localDiagnose(process.argv[3]||process.cwd()),
 null,
 2
 )
 );

 process.exit(0);
}


JS

fi


echo "[4] Syntax check"

find lib/mcp -name "*.mjs" -print0 |
while IFS= read -r -d '' f
do
 node --check "$f"
done


echo "[5] Test commands"


if command -v devctl >/dev/null 2>&1
then

devctl local-status || true

fi


echo "[6] Git commit"


git add .

git commit \
-m "feat: add mcp local debug bridge" \
|| echo "nothing to commit"


git push \
|| echo "push skipped"


echo ""
echo "================================"
echo " MCP DEBUG BRIDGE COMPLETE"
echo "================================"

