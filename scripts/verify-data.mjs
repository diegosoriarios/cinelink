import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const pool = JSON.parse(readFileSync(join(projectRoot, 'src/data/tmdbPool.json'), 'utf8'));
const puzzles = JSON.parse(readFileSync(join(projectRoot, 'src/data/puzzles.json'), 'utf8'));

const ids = new Set();
for (const person of pool) {
  if (typeof person.id !== 'number' || !person.id) {
    throw new Error('Pool has invalid TMDB id');
  }
  ids.add(person.id);
}

if (pool.length !== ids.size) {
  throw new Error('Pool contains duplicate ids');
}

if (puzzles.length !== 365) {
  throw new Error(`Expected 365 puzzles, got ${puzzles.length}`);
}

const pairSet = new Set();
let expectedDate = new Date('2026-01-01T00:00:00.000Z');

for (const entry of puzzles) {
  const date = expectedDate.toISOString().slice(0, 10);
  if (entry.date !== date) {
    throw new Error(`Expected date ${date}, got ${entry.date}`);
  }
  if (entry.startId === entry.endId) {
    throw new Error(`Invalid same start/end on ${entry.date}`);
  }
  if (!ids.has(entry.startId) || !ids.has(entry.endId)) {
    throw new Error(`Puzzle uses id outside pool on ${entry.date}`);
  }
  const key = [entry.startId, entry.endId].sort((a, b) => a - b).join(':');
  if (pairSet.has(key)) {
    throw new Error(`Duplicate pair found on ${entry.date}`);
  }
  pairSet.add(key);
  expectedDate = new Date(expectedDate.getTime() + 24 * 60 * 60 * 1000);
}

console.log('puzzle data verified');
