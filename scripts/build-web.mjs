import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(root, 'godot');
const outputPath = resolve(root, 'dist');
const executable = process.env.GODOT4 || process.env.GODOT || 'godot';

mkdirSync(outputPath, { recursive: true });

console.log('Building Openworld Simulation v2.1 with ' + executable);
const result = spawnSync(
  executable,
  ['--headless', '--path', projectPath, '--export-release', 'Web', resolve(outputPath, 'index.html')],
  { cwd: root, stdio: 'inherit' },
);

if (result.error) {
  console.error('Could not start Godot: ' + result.error.message);
  console.error('Install Godot 4.6.1 and matching Web export templates, or set GODOT4 to the executable path.');
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outputFiles = readdirSync(outputPath);
const hasWasm = outputFiles.some((name) => name.endsWith('.wasm'));
const hasPck = outputFiles.some((name) => name.endsWith('.pck'));
if (!existsSync(resolve(outputPath, 'index.html')) || !hasWasm || !hasPck) {
  console.error('Godot export did not produce index.html, a .wasm runtime, and a .pck game pack.');
  process.exit(1);
}

console.log('Web export complete: ' + resolve(outputPath, 'index.html'));
