# SubZeroDev Blog

The source repository for the SubZeroDev technical blog at
[blog.subzerodev.com](https://blog.subzerodev.com/).

## Status

The site now includes its first published post and the authoring workflow for
future posts. It currently owns the blog's content, project documentation, and
publishing configuration; additional application features will be added only
when their source and validation exist here.

## Blog

Read the inaugural post at
[blog.subzerodev.com/welcome/](https://blog.subzerodev.com/welcome/).
For authoring guidance, see
[Writing Posts](https://blog.subzerodev.com/docs/writing-posts/).

## Documentation

Project documentation is published at
[blog.subzerodev.com/docs/](https://blog.subzerodev.com/docs/).

## Development

The documentation toolchain runs in Docker. To validate documentation:

```powershell
./build/Test-Documentation.ps1
```

To build the production site:

```powershell
./docs.ps1 -BuildOnly
```

To preview the site locally:

```powershell
./docs.ps1
```

### Publishing tools

[`tools/blog-mcp`](https://github.com/The-Running-Dev/SubZeroDev.Blog/tree/main/tools/blog-mcp)
exposes this repository's deterministic publishing steps — front-matter
validation, post authoring, tag and hub maintenance, and local git — as
callable MCP tools, so an agent no longer has to get them right by reading
prose alone.

## Repository boundary

This repository owns the public blog site, its authored project documentation,
and its GitHub Pages delivery workflow. Shared Docusaurus behavior comes from
the pinned
[Docusaurus Template](https://github.com/The-Running-Dev/Docusaurus-Template)
container rather than being copied into this repository.

The implementation plan is tracked in
[MILESTONES.md](https://github.com/The-Running-Dev/SubZeroDev.Blog/blob/main/MILESTONES.md).

## License

Licensed under the [MIT License](https://blog.subzerodev.com/docs/license/).
