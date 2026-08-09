import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

try {
  // Run tsc in project mode and capture all output
  const out = execSync('npx tsc -b', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync('tsc_agora_check.txt', 'TSC_OK\n' + out);
  console.log('tsc passed cleanly (no errors)');
} catch (e) {
  const stderr = e.stderr || '';
  const stdout = e.stdout || '';
  writeFileSync('tsc_agora_check.txt', 'TSC_ERRORS\n' + stdout + stderr);
  console.log('tsc found errors (see tsc_agora_check.txt)');
}
