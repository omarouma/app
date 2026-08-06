import sys

path = sys.argv[1]
with open(path, 'r') as f:
    lines = f.readlines()

# The handleTouchEnd ends at line 377 (0-indexed: 376)
# After that, the JSX starts immediately - we need to insert the missing handlers

insert_text = '''\n  const handleClearSelection = useCallback(() => {
    setSelectedMessages(new Set());
    setSelectionMode(false);
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (window.confirm(`Delete ${selectedMessages.size} messages?`)) {
      for (const msgId of selectedMessages) {
        await handleDelete(msgId);
      }
      handleClearSelection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, selectedMessages, handleClearSelection]);

  const handleForwardSelected = useCallback(() => {
    const batch = msgs.filter(m => selectedMessages.has(m.id));
    setForwardBatch(batch as any);
    setShowForwardModal(true);
    handleClearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, selectedMessages, handleClearSelection]);

  const handleCopySelected = useCallback(() => {
    const textToCopy = msgs
      .filter(m => selectedMessages.has(m.id))
      .map(m => `[${formatDateSeparator(m.timestamp)}] ${m.senderId}: ${m.content}`)
      .join('\\n');
    navigator.clipboard.writeText(textToCopy);
    toast.success(`${selectedMessages.size} messages copied.`);
    handleClearSelection();
  }, [msgs, selectedMessages, handleClearSelection]);

  if (!currentUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100">
        <Loader className="animate-spin mb-4" />
        <p>Loading...</p>
      </div>
    );
  }
'''

# Find the line that starts with "  }, [selectionMode]);" followed by "    <div className=\"flex flex-col h-full"
for i in range(len(lines)):
    if '}, [selectionMode]);' in lines[i] and i+1 < len(lines) and '<div className="flex flex-col h-full' in lines[i+1]:
        lines.insert(i+1, insert_text)
        break

with open(path, 'w') as f:
    f.writelines(lines)

print('Fixed missing handlers')
