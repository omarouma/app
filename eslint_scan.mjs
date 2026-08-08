import { ESLint } from 'eslint';

async function main() {
  const eslint = new ESLint({});
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  console.log(output);
  const errorCount = results.reduce((a, r) => a + r.errorCount, 0);
  const warningCount = results.reduce((a, r) => a + r.warningCount, 0);
  console.log(`\nTOTAL: ${errorCount} errors, ${warningCount} warnings across ${results.length} files`);
}

main().catch((e) => { console.error(e); process.exit(1); });

