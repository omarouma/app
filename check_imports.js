const fs = require('fs');
const path = require('path');

function getAllFiles(dir, extensions) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const f = path.join(dir, file);
    const stat = fs.statSync(f);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(f, extensions));
    } else if (extensions.some(ext => f.endsWith(ext))) {
      results.push(f);
    }
  }
  return results;
}

const allSrc = getAllFiles('src', ['.ts', '.tsx', '.js', '.jsx']);
const allText = {};
for (const f of allSrc) {
  try {
    allText[f] = fs.readFileSync(f, 'utf-8');
  } catch(e) {}
}

function checkImport(targetSubpath) {
  const escaped = targetSubpath.replace(/[.*+?^${}()|[\]\]/g, '\$&');
  const regex = new RegExp('import\s+.*?\s+from\s+["\']([^"\']*' + escaped + '[^"\']*)["\']');
  const importers = [];
  for (const f in allText) {
    if (f.replace(/\/g, '/').includes(targetSubpath)) continue;
    if (regex.test(allText[f])) {
      importers.push(f);
    }
  }
  return importers;
}

const uiDir = path.join('src', 'components', 'ui');
const uiFiles = fs.readdirSync(uiDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).sort();

console.log('=== UI COMPONENTS ===');
for (const f of uiFiles) {
  const name = path.basename(f, path.extname(f));
  const importers = checkImport('/components/ui/' + name);
  if (importers.length > 0) {
    console.log('IMPORTED: ' + f);
    for (const imp of importers) {
      console.log('  <- ' + imp);
    }
  } else {
    console.log('NOT IMPORTED: ' + f);
  }
}
