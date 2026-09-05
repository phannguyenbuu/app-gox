import paramiko
import os
import subprocess
import sys
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

    if not os.path.exists(key_filename):
        print(f"❌ Error: SSH key not found at {key_filename}")
        print("Please set up SSH key authentication:")
        print("  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519")
        print("  ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<VPS_IP>")
        sys.exit(1)

    deploy_host = os.environ.get("DEPLOY_HOST", "157.66.80.125")
    deploy_port = int(os.environ.get("DEPLOY_PORT", "22"))

    print(f"Connecting to VPS at {deploy_host}:{deploy_port} using SSH key...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(deploy_host, port=deploy_port, username='root', key_filename=key_filename, timeout=10)
    except paramiko.AuthenticationException:
        print(f"❌ SSH authentication failed. Make sure your public key is added to {deploy_host}:/root/.ssh/authorized_keys")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Connection error: {e}")
        sys.exit(1)

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
                print(f"  Uploading {entry.path} -> {r_file}...")
                sftp.put(entry.path, r_file)

    print(f"Uploading frontend assets to {remote_dir}/dist...")
    upload_dir(str(local_dist), f"{remote_dir}/dist")

    sftp.close()
    ssh.close()
    print("✅ Frontend deployment completed successfully!")
    print(f"Access: https://remote.goxprint.com")

if __name__ == "__main__":
    main()
