import { rmSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'd:/gaga/GaGa Chat';
const files = [
  'TODO_call_overlay_enhance.md',
  'TODO_PROD_BUILD_DEPLOY.md',
  'TODO_PROD_CHAT_UX_IMPROVEMENTS.md',
  'TODO_PROD_IMPROVEMENTS.md',
  'TODO_REMAINING_CALL_FIX.md',
  'TODO_warn_fix_exec.md',
  'TODO_audio_recorder_production.md',
  'TODO_call_page_updates.md',
  'TODO_chat_improvements.md',
  'TODO_GROUP_CALL_FIX.md',
  'TODO_message_improvements.md',
  'TODO_post_creation_realtime.md',
  'TODO_PROD_CHAT_REALTIME_FIX.md',
  'TODO_REALTIME_CALL_FIX.md',
  'CODE_FIX_TODO.md',
  'CALLING_FIX_TRACKING.md',
  'TODO_fix_workspace.md',
  'CODE_FIX_HEADER_TODO.md',
];

const report = [];
report.push('CWD=' + process.cwd());
for (const f of files) {
  const abs = resolve(BASE, f);
  if (existsSync(abs)) {
    rmSync(abs, { force: true });
    report.push('DELETED: ' + f);
  } else {
    report.push('ALREADY_GONE: ' + f);
  }
}

const reportPath = resolve(BASE, 'deletion_report.txt');
writeFileSync(reportPath, report.join('\n'), 'utf8');
console.log(report.join('\n'));
