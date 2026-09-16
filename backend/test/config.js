const { spawnSync } = require('child_process');
const path = require('path');

const cwd = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function run(script, env = {}) {
  return spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
}

let result = run("require('./jwt')", { NODE_ENV: 'production', JWT_SECRET: '' });
check('production refuses a missing JWT secret', result.status !== 0);

result = run("require('./jwt')", { NODE_ENV: 'production', JWT_SECRET: 'short' });
check('production refuses a weak JWT secret', result.status !== 0);

result = run(`
  const jwt = require('./jwt');
  const token = jwt.sign({ sub: 'user', sid: 'session' });
  if (!jwt.verify(token) || jwt.verify(token + 'x')) process.exit(1);
`, { NODE_ENV: 'production', JWT_SECRET: 'production-test-secret-0123456789abcdef' });
check('valid access JWT accepted and tampering rejected', result.status === 0, result.stderr);

result = run("require('./turn')", {
  NODE_ENV: 'production',
  TURN_HOST: 'turn.test.invalid',
  TURN_SECRET: 'short'
});
check('production refuses a weak TURN secret', result.status !== 0);

console.log(`\n===== CONFIG RESULT: ${passed} passed, ${failed} failed =====`);
process.exit(failed ? 1 : 0);
