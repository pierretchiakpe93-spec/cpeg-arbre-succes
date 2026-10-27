import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'gestion');
const target = path.join(root, 'www');
const launcherIcon = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi', 'ic_launcher_logo.png');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await cp(launcherIcon, path.join(target, 'school-logo.png'));
console.log('Application web et logo de l’école copiés dans www/ pour la compilation Android.');
