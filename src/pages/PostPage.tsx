import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader, MessageCircle, X, Copy, Share2, Mail } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirestoreAvailable, COLLECTIONS, increment, updateDocById, subscribeToDoc } from '@/lib/firestore';
import TimelineCard from '@/components/features/timeline/TimelineCard';
import EmptyState from '@/components/EmptyState';
import { getDefaultAvatar } from '@/lib/utils';
import { toast } from 'sonner';
import {
  whatsappShareUrl, facebookShareUrl, xShareUrl,
  telegramShareUrl, linkedinShareUrl, emailShareUrl, nativeShare, copyToClipboard,
} from '@/lib/share';
import type { TimelinePost, PostComment, PostPollData } from '@/types';

/** Dynamically update the document's social-sharing (OG / Twitter) meta tags. */
function applyPostMeta(post: TimelinePost) {
  const origin = window.location.origin;
  const url = `${origin}/post/${post.id}`;
  const title = `${post.userName || 'GaGa Chat User'} shared a post on GaGa Chat`;
  const description = (post.content || '').slice(0, 160) || 'Check out this post on GaGa Chat';
  const image = post.images?.[0] || `${origin}/logo-512.png`;

  const setMeta = (prop: string, content: string) => {
    let el = document.head.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('og:title', title);
  setMeta('og:description', description);
  setMeta('og:image', image);
  setMeta('og:url', url);
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', image);
  document.title = title;
}

/**
 * Renders a single post by URL `:id`.
 *
 * This is the destination for shared post links (e.g. `/post/<id>`) opened
 * from WhatsApp, Facebook, X, Telegram, or copied links. It loads the post
 * from the backend and (optionally) records a view.
 */
export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [post, setPost] = useState<TimelinePost | null>(null);
  const [loading, setLoading] = useState(() => !!id && isFirestoreAvailable());
  const [notFound, setNotFound] = useState(() => !id || !isFirestoreAvailable());
  const [showShareModal, setShowShareModal] = useState(false);

  // Reset page state when the route param changes (render-time adjustment
  // instead of setState inside the effect body)
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    setPrevId(id);
    const valid = !!id && isFirestoreAvailable();
    setLoading(valid);
    setNotFound(!valid);
    setPost(null);
  }

  const mapRow = useCallback((d: Record<string, unknown>): TimelinePost => ({
    id: d.id as string,
    userId: d.userId as string,
    content: (d.content as string) || '',
    images: (d.images as string[]) || [],
    likes: (d.likes as string[]) || [],
    comments: (d.comments as PostComment[]) || [],
    shares: (d.shares as string[]) || [],
    timestamp: (() => {
      const ts = d.timestamp;
      if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate(): Date }).toDate === 'function') {
        return (ts as { toDate(): Date }).toDate();
      }
      return new Date(ts as string | number);
    })(),
visibility: (d.visibility as TimelinePost['visibility']) || 'public',
    pollData: (d.pollData as PostPollData) || undefined,
    userName: (d.userName as string) || 'User',
    userAvatar: (d.userAvatar as string) || undefined,
    videoUrl: (d.videoUrl as string) || undefined,
    mediaType: (d.mediaType as TimelinePost['mediaType']) || 'text',
  } as TimelinePost), []);

  useEffect(() => {
    let active = true;
    if (!id || !isFirestoreAvailable()) {
      return () => { active = false; };
    }

    let viewed = false;
    let initialLoadDone = false;
    const unsub = subscribeToDoc(COLLECTIONS.POSTS, id, (row) => {
      if (!active) return;
      if (!row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const mapped = mapRow(row as Record<string, unknown>);
      setPost(mapped);
      if (!initialLoadDone) {
        initialLoadDone = true;
        setLoading(false);
        applyPostMeta(mapped);
        if (!viewed) {
          viewed = true;
          try {
            updateDocById(COLLECTIONS.POSTS, id, { viewCount: increment(1) }).catch(() => { /* ignore */ });
          } catch { /* ignore */ }
        }
      }
    });

    return () => { active = false; unsub(); };
  }, [id, mapRow]);

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/timeline')}
          className="p-2 rounded-full hover:bg-white/5 text-white transition-colors"
          aria-label="Back to feed"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Post</h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={20} className="animate-spin text-[#00C300]" />
          </div>
        ) : notFound || !post ? (
          <div className="px-4 py-16">
            <EmptyState
              icon={MessageCircle}
              title="Post not found"
              description="This post may have been removed or the link is invalid."
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TimelineCard
              post={post}
              index={0}
              onShare={() => setShowShareModal(true)}
              userName={post.userName}
              userAvatar={post.userAvatar}
            />
          </motion.div>
        )}
      </div>

      {/* Share modal (simple in-page re-share) */}
      {showShareModal && post && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setShowShareModal(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Share Post</h3>
              <button type="button" onClick={() => setShowShareModal(false)} className="text-[#8D8D8D] hover:text-white p-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {(() => {
              const url = `${window.location.origin}/post/${post.id}`;
              const text = post.content || 'Check out this post on GaGa Chat';
              const title = 'GaGa Chat Post';
              const base = 'flex items-center gap-3 p-3 rounded-xl w-full text-white hover:bg-[#333] transition-colors';
              return (
                <div className="flex flex-col gap-2">
                  <a href={whatsappShareUrl({ text, url })} target="_blank" rel="noopener noreferrer"
                    onClick={() => setShowShareModal(false)} className={`${base} bg-[#25D366]/20 hover:bg-[#25D366]/30`}>
                    <span className="text-lg">💬</span> WhatsApp
                  </a>
                  <a href={facebookShareUrl({ url })} target="_blank" rel="noopener noreferrer"
                    onClick={() => setShowShareModal(false)} className={`${base} bg-[#1877F2]/20 hover:bg-[#1877F2]/30`}>
                    <span className="text-lg">📘</span> Facebook
                  </a>
                  <a href={xShareUrl({ text, url })} target="_blank" rel="noopener noreferrer"
                    onClick={() => setShowShareModal(false)} className={`${base} bg-white/10 hover:bg-white/20`}>
                    <span className="text-lg">𝕏</span> X (Twitter)
                  </a>
                  <a href={telegramShareUrl({ text, url })} target="_blank" rel="noopener noreferrer"
                    onClick={() => setShowShareModal(false)} className={`${base} bg-[#229ED9]/20 hover:bg-[#229ED9]/30`}>
                    <span className="text-lg">✈️</span> Telegram
                  </a>
                  <a href={linkedinShareUrl({ url })} target="_blank" rel="noopener noreferrer"
                    onClick={() => setShowShareModal(false)} className={`${base} bg-[#0A66C2]/20 hover:bg-[#0A66C2]/30`}>
                    <span className="text-lg">💼</span> LinkedIn
                  </a>
                  <a href={emailShareUrl({ title, text, url })} onClick={() => setShowShareModal(false)} className={`${base} bg-[#8D8D8D]/20 hover:bg-[#8D8D8D]/30`}>
                    <Mail size={18} className="text-[#8D8D8D]" /> Email
                  </a>

                  <div className="border-t border-[#2a2a2a] my-1" />

                  <button
                    type="button"
                    onClick={async () => {
                      const usedNative = await nativeShare({ title, text, url });
                      if (!usedNative) {
                        const ok = await copyToClipboard(url);
                        toast.success(ok ? 'Link copied!' : 'Could not copy link');
                      }
                      setShowShareModal(false);
                    }}
                    className={`${base} flex items-center justify-center gap-2 bg-[#2a2a2a] hover:bg-[#333]`}
                  >
                    <Share2 size={18} className="text-[#00C300]" /> Share via...
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(url);
                      toast.success(ok ? 'Link copied!' : 'Could not copy link');
                      setShowShareModal(false);
                    }}
                    className={`${base} flex items-center justify-center gap-2 bg-[#2a2a2a] hover:bg-[#333]`}
                  >
                    <Copy size={18} className="text-[#00C300]" /> Copy Link
                  </button>
                </div>
              );
            })()}
          </motion.div>
        </motion.div>
      )}

      {/* Avatar fallback used by TimelineCard */}
      <span className="hidden">
        <img src={user?.avatar || getDefaultAvatar(user?.id || 'U')} alt="" />
      </span>
    </div>
  );
}
