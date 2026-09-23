import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.cache']);
const readable = new Set(['', '.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.example', '.gitignore']);
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    if (entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!readable.has(extname(entry.name)) && entry.name !== '.env.example') continue;
    const text = await readFile(path, 'utf8');
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) findings.push(relative(root, path));
  }
}

await scan(root);
if (findings.length) {
  console.error(`Potential secrets found in: ${findings.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Secret scan passed: no OpenAI-style keys found.');
}
