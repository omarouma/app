import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, User as UserIcon, Send, Smartphone, PenLine, Check } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeMediaUrl } from '@/lib/utils';

export interface ContactCard {
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  username?: string;
  bio?: string;
}

export interface ContactPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** The current user's friends, offered as quick-pick contacts. */
  friends: Array<{ id: string; name?: string; username?: string; avatar?: string; phone?: string; email?: string; bio?: string }>;
  onSend: (contact: ContactCard) => void;
}

type Tab = 'friends' | 'device' | 'manual';

/**
 * Bottom sheet for sharing a contact card. Offers three sources: the user's
 * GaGa friends, the device address book (via the Contact Picker API where
 * available), or a manually typed contact. A confirmation preview is shown
 * before sending.
 *
 * Design-system rule (E1): ONE primary GaGa accent (green).
 */
export function ContactPickerSheet({ open, onClose, friends, onSend }: ContactPickerSheetProps) {
  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ContactCard | null>(null);
  const [manual, setManual] = useState({ name: '', phone: '', email: '' });
  const [deviceBusy, setDeviceBusy] = useState(false);

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.username || '').toLowerCase().includes(q) ||
        (f.phone || '').includes(q),
    );
  }, [friends, query]);

  const reset = () => {
    setSelected(null);
    setQuery('');
    setManual({ name: '', phone: '', email: '' });
    setTab('friends');
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickDeviceContact = async () => {
    const nav = navigator as unknown as {
      contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<Record<string, string[]>>> };
    };
    if (!nav.contacts?.select) {
      toast.error('Device contacts aren\'t available here. Use manual entry.');
      setTab('manual');
      return;
    }
    setDeviceBusy(true);
    try {
      const results = await nav.contacts.select(['name', 'tel', 'email'], { multiple: false });
      const first = results?.[0];
      if (first) {
        setSelected({
          userId: '',
          name: first.name?.[0] || 'Contact',
          phone: first.tel?.[0],
          email: first.email?.[0],
        });
      }
    } catch {
      toast.error('Could not read device contacts.');
    } finally {
      setDeviceBusy(false);
    }
  };

  const confirmManual = () => {
    if (!manual.name.trim()) {
      toast.error('Please enter a name.');
      return;
    }
    setSelected({ userId: '', name: manual.name.trim(), phone: manual.phone.trim() || undefined, email: manual.email.trim() || undefined });
  };

  const send = () => {
    if (!selected) return;
    onSend(selected);
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={close}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-background rounded-t-3xl w-full max-w-lg flex flex-col max-h-[85vh]"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 dark:bg-white/20 rounded-full mx-auto mt-3 mb-2" />

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-bold text-foreground">
                {selected ? 'Send contact' : 'Share a contact'}
              </h3>
              <button type="button" onClick={close} aria-label="Close" className="p-2 -mr-1 text-muted-foreground hover:text-foreground rounded-full">
                <X size={18} />
              </button>
            </div>

            {selected ? (
              /* ── Confirmation preview ── */
              <div className="px-5 pb-2">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted">
                  <div className="w-12 h-12 rounded-full bg-[#00C300]/10 dark:bg-[#00C300]/15 flex items-center justify-center overflow-hidden shrink-0">
                    {sanitizeMediaUrl(selected.avatar) ? (
                      <img src={sanitizeMediaUrl(selected.avatar)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={22} className="text-[#00C300]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selected.name}</p>
                    {selected.username && <p className="text-xs text-muted-foreground truncate">@{selected.username}</p>}
                    {selected.phone && <p className="text-xs text-muted-foreground truncate">{selected.phone}</p>}
                    {selected.email && <p className="text-xs text-muted-foreground truncate">{selected.email}</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex-1 py-3 rounded-2xl bg-muted text-foreground text-sm font-bold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    className="flex-1 py-3 rounded-2xl bg-[#00C300] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <Send size={16} /> Send
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="px-5 flex gap-2 pb-3">
                  {([
                    { id: 'friends', label: 'Friends', icon: UserIcon },
                    { id: 'device', label: 'Device', icon: Smartphone },
                    { id: 'manual', label: 'Manual', icon: PenLine },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        tab === id ? 'bg-[#00C300]/10 dark:bg-[#00C300]/15 text-[#00C300]' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>

                {tab === 'friends' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-5 pb-2">
                      <div className="flex items-center gap-2 bg-muted rounded-2xl px-3 py-2">
                        <Search size={16} className="text-muted-foreground shrink-0" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search friends…"
                          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1">
                      {filteredFriends.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            setSelected({
                              userId: f.id,
                              name: f.name || 'User',
                              username: f.username,
                              avatar: f.avatar,
                              phone: f.phone,
                              email: f.email,
                              bio: f.bio,
                            })
                          }
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {sanitizeMediaUrl(f.avatar) ? (
                              <img src={sanitizeMediaUrl(f.avatar)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-[#00C300]/10 text-[#00C300] font-bold text-sm">
                                {(f.name || 'U').charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{f.name || 'User'}</p>
                            {f.username && <p className="text-[11px] text-muted-foreground truncate">@{f.username}</p>}
                          </div>
                        </button>
                      ))}
                      {filteredFriends.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">No friends found.</p>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'device' && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Pick a contact from your phone's address book.
                    </p>
                    <button
                      type="button"
                      onClick={pickDeviceContact}
                      disabled={deviceBusy}
                      className="w-full py-3.5 rounded-2xl bg-[#00C300] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                    >
                      <Smartphone size={17} />
                      {deviceBusy ? 'Opening contacts…' : 'Choose from device'}
                    </button>
                  </div>
                )}

                {tab === 'manual' && (
                  <div className="px-5 pb-4 space-y-2">
                    <input
                      value={manual.name}
                      onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                      placeholder="Name *"
                      className="w-full bg-muted rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                    <input
                      value={manual.phone}
                      onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))}
                      placeholder="Phone"
                      inputMode="tel"
                      className="w-full bg-muted rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                    <input
                      value={manual.email}
                      onChange={(e) => setManual((m) => ({ ...m, email: e.target.value }))}
                      placeholder="Email"
                      inputMode="email"
                      className="w-full bg-muted rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                    <button
                      type="button"
                      onClick={confirmManual}
                      className="w-full py-3.5 rounded-2xl bg-[#00C300] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <Check size={17} /> Continue
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ContactPickerSheet;
