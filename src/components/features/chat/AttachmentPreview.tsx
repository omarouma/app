import { useEffect, useState } from 'react';

function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (file.type.startsWith('image/')) return <img src={url} alt={file.name} className="h-24 w-28 object-cover rounded-xl" />;
  if (file.type.startsWith('video/')) return <video src={url} controls playsInline preload="metadata" className="h-24 w-28 rounded-xl bg-black" />;
  return <div className="h-24 w-28 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs p-2 break-all">{file.name}</div>;
}

export function AttachmentPreview({ files, onChange, onSend, onBusy }: {
  files: File[];
  onChange: (files: File[]) => void;
  onSend: (files: File[]) => Promise<File[]>;
  onBusy: (busy: boolean) => void;
}) {
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(0);
  if (!files.length) return null;
  return <section aria-label="Attachment preview" className="shrink-0 border-t bg-white dark:bg-gray-900 p-3">
    <div className="flex gap-3 overflow-x-auto pb-2">
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="relative shrink-0">
        <Preview file={file} />
        <span className="block text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
        <button type="button" disabled={sending} aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))} className="absolute right-0 top-0 rounded-full bg-black text-white w-7 h-7 disabled:opacity-40">×</button>
      </div>)}
    </div>
    <div className="flex items-center justify-between gap-3">
      <span role="status" className="text-sm">{sending ? `Sending ${completed + 1} of ${files.length}…` : `${files.length} attachment(s) ready`}</span>
      <button type="button" disabled={sending} className="rounded-full bg-green-600 text-white px-5 py-2 disabled:opacity-50" onClick={async () => {
        setSending(true);
        onBusy(true);
        setCompleted(0);
        const failed: File[] = [];
        try {
          for (const file of files) {
            try { failed.push(...await onSend([file])); }
            catch { failed.push(file); }
            setCompleted(count => count + 1);
          }
          onChange(failed);
        } finally { setSending(false); onBusy(false); }
      }}>{sending ? 'Sending…' : 'Send attachments'}</button>
    </div>
  </section>;
}
