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

import re

def sanitize_text(text: str) -> str:
    """Masks tokens, secrets, and auth URLs from command strings and logs."""
    return re.sub(r"https://x-access-token:[^@]+@", "https://x-access-token:***@", text)

def run(cmd, cwd=None, sensitive=False):
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
    log_cmd = sanitize_text(cmd_str) if sensitive or "x-access-token" in cmd_str else cmd_str
    print(f"[*] Running: {log_cmd}", flush=True)
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
        print(sanitize_text(res.stdout.strip()), flush=True)
    if res.returncode != 0:
        if res.stderr:
            print(f"[!] Stderr: {sanitize_text(res.stderr.strip())}", flush=True)
        raise RuntimeError(f"Command failed with exit code {res.returncode}")
    return res.stdout.strip()

def main():
    print("=== DEPLOYING TO GITHUB PAGES ===", flush=True)
    
    # Get auth token from gh CLI quietly without printing
    print("[*] Retrieving auth token from gh CLI...", flush=True)
    res_token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
    if res_token.returncode != 0 or not res_token.stdout.strip():
        raise RuntimeError("Failed to retrieve auth token from GitHub CLI.")
    token = res_token.stdout.strip()
    print("[+] Successfully authenticated via GitHub CLI (token secured).", flush=True)

    # Remote push URL with token (masked in all output logs)
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
    run(["git", "config", "core.autocrlf", "false"], cwd=DIST)

    # Enforce LF in dist git repo
    (DIST / ".gitattributes").write_text("* text eol=lf\n", encoding="utf-8")

    run(["git", "checkout", "-B", "gh-pages"], cwd=DIST)
    run(["git", "add", "-A"], cwd=DIST)
    run(["git", "commit", "-m", "deploy: publish MML research terminal to GitHub Pages"], cwd=DIST)

    # Push to origin gh-pages with sanitized logging
    print("[*] Pushing dist to origin/gh-pages...", flush=True)
    run(["git", "push", "-f", push_url, "gh-pages"], cwd=DIST, sensitive=True)
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
