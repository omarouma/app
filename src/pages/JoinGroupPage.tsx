import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Loader, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useGroupStore } from '@/store/useGroupStore';
import { toast } from 'sonner';

/**
 * Handles deep links of the form /join/:code — the target of group invite
 * links created from GroupInfoPage. Resolves the invite code to a group,
 * adds the current user as a participant, then redirects into the group.
 */
export default function JoinGroupPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const { joinGroupByInvite } = useGroupStore();
  const [status, setStatus] = useState<'joining' | 'error'>('joining');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!code || !user) return;
      const groupId = await joinGroupByInvite(code, user.id);
      if (cancelled) return;
      if (groupId) {
        toast.success('You joined the group');
        navigate(`/group/${groupId}`, { replace: true });
      } else {
        setStatus('error');
      }
    };
    run();
    return () => { cancelled = true; };
  }, [code, user, joinGroupByInvite, navigate]);

  return (
    <div className="min-h-[100dvh] bg-muted flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        {status === 'joining' ? (
          <>
            <Loader size={40} className="mx-auto mb-4 animate-spin text-[#00C300]" />
            <p className="text-foreground font-medium">Joining group…</p>
            <p className="text-sm text-muted-foreground mt-1">Verifying your invite link</p>
          </>
        ) : (
          <>
            <AlertCircle size={40} className="mx-auto mb-4 text-[#FF3B30]" />
            <p className="text-foreground font-medium">Invalid or expired invite</p>
            <p className="text-sm text-muted-foreground mt-1">This invite link is no longer valid.</p>
            <button
              type="button"
              onClick={() => navigate('/chats')}
              className="mt-5 inline-flex items-center gap-2 bg-[#00C300] text-white rounded-xl px-5 py-2.5 text-sm font-medium"
            >
              <Users size={16} /> Go to Chats
            </button>
          </>
        )}
      </div>
    </div>
  );
}
