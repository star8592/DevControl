use std::process::Command;

fn ssh(cmd:&str)->String{

    let out = Command::new("ssh")
        .arg("root@lic.toktik.tech")
        .arg(cmd)
        .output();

    match out {
        Ok(v)=>{
            format!(
                "{}{}",
                String::from_utf8_lossy(&v.stdout),
                String::from_utf8_lossy(&v.stderr)
            )
        },
        Err(e)=>{
            format!("error {}",e)
        }
    }
}


pub fn status(){

    println!("===== Delivery Status =====");

    println!("{}",ssh(
        "systemctl is-active commerceflow-delivery"
    ));

    println!("{}",ssh(
        "curl -s http://127.0.0.1:18120/health"
    ));
}


pub fn test(){

    println!("===== Delivery Smoke Test =====");

    println!("{}",ssh(
        "curl -s http://127.0.0.1:18120/health"
    ));
}


pub fn deploy(){

    println!("===== Delivery Deploy =====");

    println!("{}",ssh(
        "systemctl restart commerceflow-delivery && systemctl is-active commerceflow-delivery"
    ));
}


pub fn rollback(){

    println!("===== Delivery Rollback =====");

    println!("{}",ssh(
        "ls /opt/commerceflow-delivery/releases | tail"
    ));
}
