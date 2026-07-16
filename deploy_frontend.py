import paramiko
import os
import subprocess
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent
    local_dist = root_dir / "dist"
    
    print("Building app-gox locally...")
    subprocess.run("npm run build", shell=True, cwd=str(root_dir), check=True)
    
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
    
    print("Opening SFTP session...")
    sftp = ssh.open_sftp()
    
    remote_dir = "/var/www/app-gox"
    
    # Helper to recursively upload
    def upload_dir(local_path, remote_path):
        try:
            sftp.mkdir(remote_path)
        except IOError:
            pass
            
        for entry in os.scandir(local_path):
            if entry.is_dir():
                upload_dir(entry.path, f"{remote_path}/{entry.name}")
            else:
                r_file = f"{remote_path}/{entry.name}"
                print(f"Uploading {entry.path} -> {r_file}...")
                sftp.put(entry.path, r_file)
                
    print(f"Uploading frontend assets to {remote_dir}...")
    upload_dir(str(local_dist), remote_dir)
    
    sftp.close()
    ssh.close()
    print("Frontend deployment completed successfully!")

if __name__ == "__main__":
    main()
