
export function createFailurePacket(result){

    return {

        project:result.project,

        status:
          result.check.success?
          "PASS":
          "FAILED",

        type:result.type,

        evidence:{
          command:
            result.check.command,

          error:
            result.check.error || null,

          output:
            result.check.output?.slice(0,3000)
        },

        timestamp:
          result.timestamp
    };

}

