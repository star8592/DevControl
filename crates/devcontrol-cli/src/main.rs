use std::env;


fn help(){

println!(r#"
DevControl CLI

Commands:

discover
status
regression <path>
autonomous <path>
agent start
report
repair

"#);

}


fn main(){

let args:Vec<String>=env::args().collect();


match args.get(1)
.map(|x|x.as_str())
{


Some("discover")=>{
 println!("discover");
}


Some("status")=>{
 println!("DevControl online");
}


Some("regression")=>{

println!("Regression runner");

if let Some(p)=args.get(2){
 println!("Project: {}",p);
}

}


Some("autonomous")=>{

println!("Autonomous runner");

}


Some("agent")=>{

println!("Agent");

}


Some("report")=>{

println!("Report");

}


Some("repair")=>{

println!("Repair");

}


_=>{
 help();
}


}

}
