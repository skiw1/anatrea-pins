import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run pack:library from the repository.');

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
delete manifest.scripts;
const readme = await readFile(new URL('README.md', root), 'utf8');
const stage = await mkdtemp(join(tmpdir(), 'anatrea-pins-library-'));
try {
  await cp(new URL('src/', root), join(stage, 'src'), { recursive: true });
  await cp(new URL('LICENSE', root), join(stage, 'LICENSE'));
  await writeFile(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  // The repository's GitHub-specific video player is linked separately in the npm README.
  await writeFile(join(stage, 'README.md'), readme.replace(/^https:\/\/github\.com\/user-attachments\/assets\/\S+\r?\n\r?\n/m, ''));
  const result = spawnSync(process.execPath, [
    npm, 'pack', stage, '--pack-destination', fileURLToPath(root), ...process.argv.slice(2)
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
