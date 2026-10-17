import sys
import os
import shutil
import subprocess
from pathlib import Path

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "apps" / "web" / "dist"

def run(cmd, cwd=None):
    print(f"[*] Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}", flush=True)
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    res = subprocess.run(
        cmd,
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
        env=env,
        encoding="utf-8",
        errors="replace"
    )
    if res.stdout:
        print(res.stdout.strip(), flush=True)
    if res.returncode != 0:
        if res.stderr:
            print(f"[!] Stderr: {res.stderr.strip()}", flush=True)
        raise RuntimeError(f"Command failed with exit code {res.returncode}")
    return res.stdout.strip()

def main():
    print("=== DEPLOYING TO GITHUB PAGES ===", flush=True)
    
    # Get auth token from gh CLI
    print("[*] Retrieving auth token from gh CLI...", flush=True)
    token = run(["gh", "auth", "token"])
    print(f"[+] Retrieved token (length: {len(token)})", flush=True)

    # Remote push URL with token
    push_url = f"https://x-access-token:{token}@github.com/hantrleko/MarketMicrostructureLab.git"

    # Verify dist folder
    if not DIST.exists() or not (DIST / "index.html").exists():
        raise FileNotFoundError(f"Build output not found at {DIST}")

    nojekyll = DIST / ".nojekyll"
    if not nojekyll.exists():
        nojekyll.write_text("# Disable Jekyll\n", encoding="utf-8")

    data_dir = DIST / "data"
    json_count = len(list(data_dir.glob("*.json")))
    print(f"[+] Verified {json_count} fixtures in dist/data/", flush=True)

    # Clean existing dist/.git
    dist_git = DIST / ".git"
    if dist_git.exists():
        shutil.rmtree(dist_git, ignore_errors=True)

    # Initialize and commit
    run(["git", "init"], cwd=DIST)
    run(["git", "config", "user.name", "hantrleko"], cwd=DIST)
    run(["git", "config", "user.email", "hantrleko@users.noreply.github.com"], cwd=DIST)
    run(["git", "checkout", "-B", "gh-pages"], cwd=DIST)
    run(["git", "add", "-A"], cwd=DIST)
    run(["git", "commit", "-m", "deploy: publish MML research terminal to GitHub Pages"], cwd=DIST)

    # Push to origin gh-pages
    print("[*] Pushing dist to origin/gh-pages...", flush=True)
    run(["git", "push", "-f", push_url, "gh-pages"], cwd=DIST)
    print("[+] Pushed successfully to gh-pages branch!", flush=True)

    # Clean up local git in dist
    shutil.rmtree(DIST / ".git", ignore_errors=True)

    # Configure GitHub Pages via gh CLI
    print("\n[*] Configuring GitHub Pages...", flush=True)
    try:
        pages_status = run(["gh", "api", "repos/hantrleko/MarketMicrostructureLab/pages"])
        print(f"[+] Pages already active:\n{pages_status}", flush=True)
    except Exception:
        print("[*] Enabling Pages on gh-pages branch...", flush=True)
        try:
            enable_out = run([
                "gh", "api", "-X", "POST", "repos/hantrleko/MarketMicrostructureLab/pages",
                "-F", "source[branch]=gh-pages",
                "-F", "source[path]=/"
            ])
            print(f"[+] Pages created:\n{enable_out}", flush=True)
        except Exception as e:
            print(f"[!] Note on API call: {e}", flush=True)

    print("\n=======================================================", flush=True)
    print("[SUCCESS] Market Microstructure Lab deployed successfully!", flush=True)
    print("Public Live Terminal URL: https://hantrleko.github.io/MarketMicrostructureLab/", flush=True)
    print("=======================================================", flush=True)

if __name__ == "__main__":
    main()
