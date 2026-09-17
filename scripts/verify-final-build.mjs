import { execFileSync } from 'node:child_process';
// Fail immediately and preserve a failing exit status for release automation.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const args of [['test'], ['run', 'check:calling'], ['run', 'build'], ['run', 'verify:release']]) {
  execFileSync(npm, args, { stdio: 'inherit', timeout: 300000, shell: process.platform === 'win32' });
}
execFileSync(process.execPath, ['--test', 'alibaba-calling/server.test.mjs'], { stdio: 'inherit', timeout: 30000 });
