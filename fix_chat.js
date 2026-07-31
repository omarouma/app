const fs = require('fs');

// ── MessageItem.tsx ──────────────────────────────────────────────────────────
const miPath = 'src/components/features/chat/MessageItem.tsx';
let mi = fs.readFileSync(miPath, 'utf8');

// 1. Add VoiceWaveform import
mi = mi.replace(
  "ReadReceipt } from './ReadReceipt';\nimport type { Message }",
  "ReadReceipt } from './ReadReceipt';\nimport { VoiceWaveform } from './VoiceWaveform';\nimport type { Message }"
);

// 2. Remove onSetReplyingTo from interface
mi = mi.replace('  onSetReplyingTo: (msg: Message) => void;\n', '');

// 3. Remove onSetReplyingTo from destructuring
mi = mi.replace(', onSetReplyingTo', '');

// 4. Replace plain <audio> with VoiceWaveform
const audioOld = '              <audio src={msg.mediaUrl} className="max-w-full mb-1" controls />';
const audioNew = `              <div className={\`rounded-2xl mb-1 px-3 py-2 \${isMe ? 'bg-[#00C300]' : 'bg-white'}\`}>
                <VoiceWaveform audioUrl={msg.mediaUrl} isOwnMessage={isMe} />
              </div>`;
mi = mi.replace(audioOld, audioNew);

// 5. Fix reply-to preview with sender name
const replyOld = `replyTo && (
              <div className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5">
                <p className={\`text-[10px] truncate \${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}\`}>
                  {(() => {
                    const r = msgs.find(m => m.id === msg.replyTo);
                    return r ? r.content.substring(0, 30) + (r.content.length > 30 ? '...' : '') : 'Replying to message';
                  })()}
                </p>
              </div>
            )}`;
const replyNew = `replyTo && (() => {
              const r = msgs.find(m => m.id === msg.replyTo);
              return (
                <div className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5">
                  <p className={\`text-[10px] font-medium \${isMe ? 'text-white/70' : 'text-[#00C300]'}\`}>
                    Replying to {r ? (r.senderId === currentUserId ? 'You' : displayUser.name) : 'message'}
                  </p>
                  <p className={\`text-[11px] truncate \${isMe ? 'text-white/60' : 'text-[#8D8D8D]'}\`}>
                    {r ? r.content.substring(0, 60) + (r.content.length > 60 ? '...' : '') : ''}
                  </p>
                </div>
              );
            })()`;
mi = mi.replace(replyOld, replyNew);

fs.writeFileSync(miPath, mi, 'utf8');

// ── ChatRoom.tsx ─────────────────────────────────────────────────────────────
const crPath = 'src/components/features/chat/ChatRoom.tsx';
let cr = fs.readFileSync(crPath, 'utf8');

// Fix misplaced pushNotificationService import (move before BG_OPTIONS)
cr = cr.replace(
  "import { SWIPE_THRESHOLD, REPORT_OPTIONS, formatDateSeparator } from '@/lib/chatConstants';",
  "import { SWIPE_THRESHOLD, REPORT_OPTIONS, formatDateSeparator } from '@/lib/chatConstants';\nimport { pushNotificationService } from '@/services/pushNotificationService';"
);
cr = cr.replace("\nimport { pushNotificationService } from '@/services/pushNotificationService';\n\nimport TransferModal", "\nimport TransferModal");

// Fix chatBg double-read: remove lazy initializer from useState
cr = cr.replace(
  "useState<string>(() => localStorage.getItem(`chat_bg_${chatId}`) || '')",
  "useState<string>('')"
);

// Remove trivial wrapper callbacks
const wrappers = [
  [/\n\n  const handleSetLightbox = useCallback\(\(url: string\) => \{\n.*?setLightboxImage\(url\);\n  \}, \[\]\);/s, ''],
  [/\n\n  const handleNavigate = useCallback\(\(path: string\) => \{\n.*?navigate\(path\);\n.*?\}, \[navigate\]\);/s, ''],
  [/\n\n  const handleVotePoll = useCallback\(\(cId: string, msgId: string, idx: number, uId: string\) => \{\n.*?votePoll\(cId, msgId, idx, uId\);\n.*?\}, \[votePoll\]\);/s, ''],
  [/\n\n  const handleSetReactionMsg = useCallback\(\(id: string \| null\) => \{\n.*?setSelectedReactionMsg\(id\);\n  \}, \[\]\);/s, ''],
  [/\n\n  const handleEditInputChange = useCallback\(\(v: string\) => \{\n.*?setEditInput\(v\);\n.*?\}, \[\]\);/s, ''],
  [/\n\n  const handleSetReplyingTo = useCallback\(\(msg: Message\) => \{\n.*?setReplyingTo\(msg\);\n.*?\}, \[\]\);/s, ''],
];
for (const [pattern, replacement] of wrappers) {
  cr = cr.replace(pattern, replacement);
}

// Update JSX props to use direct references
cr = cr.replace('onSetReactionMsg={handleSetReactionMsg}', 'onSetReactionMsg={setSelectedReactionMsg}');
cr = cr.replace('onEditInputChange={handleEditInputChange}', 'onEditInputChange={setEditInput}');
cr = cr.replace('onSetReplyingTo={handleSetReplyingTo}', 'onSetReplyingTo={setReplyingTo}');
cr = cr.replace('onSetLightbox={handleSetLightbox}', 'onSetLightbox={setLightboxImage}');
cr = cr.replace('onVotePoll={handleVotePoll}', 'onVotePoll={votePoll}');
cr = cr.replace('onNavigate={handleNavigate}', 'onNavigate={navigate}');

fs.writeFileSync(crPath, cr, 'utf8');

// Verify
const mi2 = fs.readFileSync(miPath, 'utf8');
const cr2 = fs.readFileSync(crPath, 'utf8');
console.log('=== MessageItem ===');
console.log('VoiceWaveform import:', mi2.includes("import { VoiceWaveform }"));
console.log('onSetReplyingTo removed:', !mi2.includes('onSetReplyingTo'));
console.log('audio removed:', !mi2.includes('<audio'));
console.log('reply sender name:', mi2.includes('displayUser.name'));
console.log('=== ChatRoom ===');
console.log('pushNotif before BG_OPTIONS:', cr2.indexOf('pushNotificationService') < cr2.indexOf('BG_OPTIONS'));
console.log('chatBg lazy init removed:', !cr2.includes('() => localStorage.getItem'));
console.log('handleSetLightbox removed:', !cr2.includes('handleSetLightbox'));
console.log('handleNavigate removed:', !cr2.includes('handleNavigate'));
console.log('handleVotePoll removed:', !cr2.includes('handleVotePoll'));
console.log('handleSetReactionMsg removed:', !cr2.includes('handleSetReactionMsg'));
console.log('handleEditInputChange removed:', !cr2.includes('handleEditInputChange'));
console.log('handleSetReplyingTo removed:', !cr2.includes('handleSetReplyingTo'));
