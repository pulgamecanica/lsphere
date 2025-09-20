# lsphere

A CLI tool to visualize directories as **circle packing charts** using D3 + TypeScript.  
Think of it as `ls`, but spherical 🌐.

## Quick Start

```bash
# install deps
make deps

# build the CLI
make build

# run demo (will output a single circle SVG)
make run

# open the SVG in your system viewer
make show
```

- deps → install dependencies (npm install or bun install if BUN=1)

- build → bundle into dist/lsphere

- run → run the CLI (currently: outputs a demo circle to output/composite.svg)

- show → open the generated SVG

- clean → remove build + output

- distclean → also remove node_modules

#### Roadmap
 
  Demo circle rendering (D3 smoke test)

  Directory scanning

  Configurable palettes & depth

  JSON + HTML viewer

  Multiple output modes (composite/cells/formats)
