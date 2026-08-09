import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const steps = [
  { name: 'TSC', cmd: 'npx tsc -b' },
  { name: 'BUILD', cmd: 'npm run build' },
];

const report = [];
for (const s of steps) {
  try {
    const out = execSync(s.cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 300000 });
    report.push(`=== ${s.name} SUCCESS ===`);
    report.push(out);
  } catch (e) {
    report.push(`=== ${s.name} FAILED ===`);
    report.push('STDOUT:');
    report.push((e.stdout || '').toString());
    report.push('STDERR:');
    report.push((e.stderr || '').toString());
  }
}

writeFileSync('d:/gaga/GaGa Chat/final_build_report.txt', report.join('\n'), 'utf8');
console.log('REPORT WRITTEN');
