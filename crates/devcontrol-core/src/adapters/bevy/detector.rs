use std::fs;
use std::path::Path;


pub fn detect_bevy(project:&Path)->bool{

    let cargo = project.join("Cargo.toml");

    if !cargo.exists(){
        return false;
    }


    let content = fs::read_to_string(cargo)
        .unwrap_or_default();


    content.contains("bevy")
}

