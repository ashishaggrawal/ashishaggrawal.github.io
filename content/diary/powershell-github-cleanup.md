---
title: 5 lines of PowerShell to clean up your GitHub portfolio
date: 2025-12-12
summary: A small automation that saved a lot of clicking.
---

I spent some time cleaning up my old repositories on GitHub. Deleting them manually through the website was taking too long, so I looked into the GitHub CLI (`gh`) instead.

## The problem

The standard `gh` login doesn't give you delete rights by default. You have to request that scope explicitly before the CLI will let you delete anything.

## Step 1: Unlock permissions

```powershell
gh auth refresh -h github.com -s delete_repo
```

This re-authenticates your session with the `delete_repo` scope added, which isn't granted by default for safety reasons.

## Step 2: The deletion loop

```powershell
gh repo list --limit 100 --json name --jq '.[].name' | ForEach-Object {
    $resp = Read-Host "DELETE '$_'? (y/n)"
    if ($resp -eq 'y') {
        gh repo delete $_ --confirm
    }
}
```

This fetches your repository names, asks for a `y/n` confirmation on each one individually, and only deletes the ones you approve.

## Why it matters

It's a small script, but it's a good example of a habit worth building: when a manual task starts feeling repetitive, it's usually a sign there's a faster, safer way to do it. The confirmation prompt on every repo also matters — automating a destructive action without a safeguard is how you accidentally delete something you meant to keep.

Use with caution — this genuinely deletes repositories, with no undo.
