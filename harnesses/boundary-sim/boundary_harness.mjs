#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBoundarySimulation } from '../../packages/boundary/src/index.js';

function printRows(rows) {
  const columns = ['scenario', 'pathId', 'bGotVia', 'classification', 'failClosed', 'canp', 'verdict', 'reason'];
  const widths = Object.fromEntries(columns.map((column) => [column, column.length]));

  for (const row of rows) {
    for (const column of columns) {
      widths[column] = Math.max(widths[column], String(row[column] ?? '').length);
    }
  }

  const line = columns.map((column) => column.padEnd(widths[column])).join('  ');
  console.log(line);
  console.log(columns.map((column) => '-'.repeat(widths[column])).join('  '));
  for (const row of rows) {
    console.log(columns.map((column) => String(row[column] ?? '').padEnd(widths[column])).join('  '));
  }
}

export function printBoundaryReport(report = runBoundarySimulation()) {
  printRows(report.rows);
  console.log(`final status: ${report.status}`);
  console.log(report.honesty_text);
  return report;
}

export function main() {
  return printBoundaryReport();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}

