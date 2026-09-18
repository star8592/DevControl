use devcontrol_core::discover;
use devcontrol_core::modules::delivery;


fn delivery_command(args:&Vec<String>) {

    if args.len() < 3 {
        delivery::status();
        return;
    }


    match args[2].as_str() {

        "status" => {
            delivery::status();
        },

        "test" => {
            delivery::test();
        },

        "deploy" => {
            delivery::deploy();
        },

        "rollback" => {
            delivery::rollback();
        },

        _ => {
            delivery::status();
        }
    }
}



fn main(){

    let args:Vec<String> =
        std::env::args().collect();


    if args.len()>1 {


        match args[1].as_str(){


            "discover" => {

                discover(
                    "/mnt/disk1/Code"
                );

            },


            "delivery" => {

                delivery_command(
                    &args
                );

            },


            _ => {

                println!(
                    "Commands: discover, delivery"
                );

            }

        }


    }else{

        println!(
            "Commands: discover, delivery"
        );

    }

}
