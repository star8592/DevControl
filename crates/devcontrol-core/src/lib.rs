use walkdir::WalkDir;


pub fn discover(root:&str){

    println!("Scanning: {}",root);


    for entry in WalkDir::new(root)
        .max_depth(3)
        .into_iter()
        .filter_map(|e|e.ok())
    {

        let path=entry.path();

        if path.join(".git").exists(){

            println!(
                "PROJECT: {}",
                path.display()
            );

        }

    }

}


pub mod modules;
