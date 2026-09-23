import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const output = normalize(join(root, 'dist'));
if (!output.startsWith(`${root}${sep}`) || output === root) throw new Error('Unsafe build output path');

const files = [
  'index.html', 'server.mjs', 'package.json', 'README.md', '.env.example',
  'styles.css', 'question-states.css', 'onboarding.css', 'success.css', 'marketplace.css', 'card-change.css',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => cp(join(root, file), join(output, file))));
await cp(join(root, 'src'), join(output, 'src'), { recursive: true });
console.log(`Production bundle created: ${output}`);
