---
title: Getting Started
sidebar_position: 2
---

# Getting Started

The SubZeroDev Blog repository is currently an initial documentation and
delivery scaffold. There are no article sources or application runtime to
install yet.

## Prerequisites

- Git
- PowerShell 7 or later for the documentation gate
- Docker Desktop for previewing and building the production site

## Clone and inspect

```powershell
git clone https://github.com/The-Running-Dev/SubZeroDev.Blog.git
Set-Location SubZeroDev.Blog
git status --short --branch
```

Read `AGENTS.md` before editing. It records the repository boundary, generated
files, validation commands, and pull-request policy.

## Validate the documentation

```powershell
./build/Test-Documentation.ps1
```

The gate validates local Markdown links and anchors, terminology, and generated
homepage drift.

## Preview locally

```powershell
./docs.ps1
```

The preview uses the immutable Docusaurus template image configured by the
repository. The public site is available at
[blog.subzerodev.com](https://blog.subzerodev.com/).
