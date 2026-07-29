---
title: 'SubZeroDev Blog'
description: 'The source and project documentation for the SubZeroDev technical blog.'
---

# SubZeroDev Blog

The source repository for the SubZeroDev technical blog at
[blog.subzerodev.com](/).

## Status

This repository is at its initial scaffold stage. It currently owns the blog's
documentation site and publishing configuration; article content and any
additional application features will be added separately.

## Documentation

Project documentation is published at
[blog.subzerodev.com/docs/](/docs/).

## Development

The documentation toolchain runs in Docker. To validate documentation:

```powershell
./build/Test-Documentation.ps1
```

To build the production site and regenerate the README-derived homepage:

```powershell
./docs.ps1 -BuildOnly
```

To preview the site locally:

```powershell
./docs.ps1
```

## Repository boundary

This repository owns the public blog site, its authored project documentation,
and its GitHub Pages delivery workflow. Shared Docusaurus behavior comes from
the pinned
[Docusaurus Template](https://github.com/The-Running-Dev/Docusaurus-Template)
container rather than being copied into this repository.

## License

Licensed under the [MIT License](/docs/license/).

[View the documentation](/docs/)
