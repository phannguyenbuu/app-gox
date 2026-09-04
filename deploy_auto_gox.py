import paramiko
import os
import sys
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent
    local_index = root_dir / "auto-gox" / "index.html"
    
    if not local_index.exists():
        print(f"Error: Could not find {local_index}")
        sys.exit(1)
        
    # SSH details
    home = Path.home()
    key_filename = str(home / ".ssh" / "id_ed25519")
    if not os.path.exists(key_filename):
        key_filename = str(home / ".ssh" / "id_rsa")
        
    deploy_host = os.environ.get("DEPLOY_HOST", "157.66.80.125")
    
    print(f"Connecting to VPS at {deploy_host} using key: {key_filename}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(deploy_host, username='root', key_filename=key_filename)
    
    print("Creating remote web directory...")
    ssh.exec_command("mkdir -p /var/www/auto-gox")
    
    print("Opening SFTP session...")
    sftp = ssh.open_sftp()
    
    for filename in ["index.html", "style.css", "app.js", "goxprint.svg"]:
        local_path = root_dir / "auto-gox" / filename
        remote_path = f"/var/www/auto-gox/{filename}"
        if local_path.exists():
            print(f"Uploading {local_path} -> {remote_path}...")
            sftp.put(str(local_path), remote_path)
            
    # 1. Write the correct final SSL configuration directly
    nginx_ssl_conf = """server {
    server_name auto.goxprint.com;

    root /var/www/auto-gox;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/auto.goxprint.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/auto.goxprint.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = auto.goxprint.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name auto.goxprint.com;
    return 404; # managed by Certbot
}
"""
    remote_conf_path = "/etc/nginx/sites-available/auto.goxprint.com"
    print(f"Writing final SSL Nginx configuration to {remote_conf_path}...")
    with sftp.open(remote_conf_path, "w") as f:
        f.write(nginx_ssl_conf)
        
    sftp.close()
    
    print("Enabling configuration and reloading Nginx...")
    enable_cmd = (
        "ln -sf /etc/nginx/sites-available/auto.goxprint.com /etc/nginx/sites-enabled/auto.goxprint.com && "
        "nginx -t && "
        "systemctl reload nginx"
    )
    stdin, stdout, stderr = ssh.exec_command(enable_cmd)
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
    print("Requesting SSL certificate using Certbot...")
    certbot_cmd = "certbot --nginx -d auto.goxprint.com --non-interactive --agree-tos -m phannguyenbuu@gmail.com"
    stdin, stdout, stderr = ssh.exec_command(certbot_cmd)
    print("Certbot STDOUT:", stdout.read().decode())
    print("Certbot STDERR:", stderr.read().decode())
    
    print("Verifying final Nginx config and reloading...")
    final_reload_cmd = "nginx -t && systemctl reload nginx"
    stdin, stdout, stderr = ssh.exec_command(final_reload_cmd)
    print("Final Reload STDOUT:", stdout.read().decode())
    print("Final Reload STDERR:", stderr.read().decode())
    
    ssh.close()
    print("auto.goxprint.com deployment completed successfully!")

if __name__ == "__main__":
    main()
