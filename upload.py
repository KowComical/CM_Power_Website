import subprocess
import os


def main():
    # Usage:
    git_push("/data/xuanrenSong/CM_Power_Website")


def git_push(repo_path, commit_message="Automated commit"):
    try:
        os.chdir(repo_path)

        # Pull the latest changes from the remote repository
        subprocess.run(['git', 'pull'])

        subprocess.run(['git', 'add', '--all'])
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
        print("Changes pulled and pushed successfully.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
