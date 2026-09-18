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
