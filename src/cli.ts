#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';
import { scaleLinear } from 'd3-scale';

const program = new Command();

program
  .name('lsphere')
  .description('lsphere demo: generate a simple SVG with a single circle')
  .action(() => {
    // Minimal demo dimensions (hard-coded for the smoke test)
    const width = 600;
    const height = 600;

    // Prove D3 is wired by using a scale to derive the radius
    const rScale = scaleLinear()
      .domain([0, 1])
      .range([0, Math.min(width, height) / 2]);
    const r = rScale(0.7); // 70% of half the min dimension

    // Basic SVG assembly (no DOM needed)
    const cx = width / 2;
    const cy = height / 2;
    const bg = '#ffffff';
    const fill = '#69b3a2';

    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `  <rect width="${width}" height="${height}" fill="${bg}" />`,
      `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`,
      `</svg>`,
      ``,
    ].join('\n');

    // Ensure output directory exists, then write the file
    const outDir = 'output';
    const outFile = join(outDir, 'composite.svg');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, svg, 'utf8');

    console.log(`lsphere demo written to ${outFile}`);
  });

program.parse(process.argv);
