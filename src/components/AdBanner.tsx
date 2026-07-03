import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Megaphone, ExternalLink, X, ChevronRight, Sparkles
} from 'lucide-react';
import { MOCK_ADS } from '@/lib/mockAds';

export interface AdBannerProps {
  id?: string;
  title: string;
  description: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaText?: string;
  sponsorName?: string;
  sponsorLogo?: string;
  onDismiss?: () => void;
  onClick?: () => void;
  variant?: 'feed' | 'compact' | 'story';
  priority?: number;
  className?: string;
}

export default function AdBanner({
  title,
  description,
  imageUrl,
  linkUrl,
  ctaText = 'Learn More',
  sponsorName = 'Sponsored',
  sponsorLogo,
  onDismiss,
  onClick,
  variant = 'feed',
  className = '',
}: AdBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    onDismiss?.();
  };

  const handleClick = () => {
    if (!clicked) {
      setClicked(true);
      onClick?.();
    }
  };

  if (dismissed) return null;

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={`relative bg-white rounded-xl border border-[#EBEBEB] overflow-hidden cursor-pointer hover:border-[#00C300]/30 transition-colors ${className}`}
        onClick={handleClick}
      >
        <div className="flex items-center gap-3 p-3">
          {imageUrl && (
            <div className="w-16 h-16 rounded-lg bg-[#F5F5F5] overflow-hidden shrink-0">
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Megaphone size={10} className="text-[#8D8D8D]" />
              <span className="text-[10px] text-[#8D8D8D] font-medium uppercase tracking-wide">
                Promoted
              </span>
              <span className="text-[10px] text-[#C7C7CC]">•</span>
              <span className="text-[10px] text-[#8D8D8D]">{sponsorName}</span>
            </div>
            <h4 className="text-sm font-bold text-[#111111] truncate">{title}</h4>
            <p className="text-xs text-[#8D8D8D] truncate">{description}</p>
          </div>
          <div className="flex items-center gap-1 text-[#00C300] shrink-0">
            <span className="text-xs font-medium">{ctaText}</span>
            <ChevronRight size={14} />
          </div>
        </div>
        {onDismiss && (
          <button type="button" onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 hover:bg-[#F5F5F5] rounded-full transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
            style={{ opacity: 0.6 }}
          >
            <X size={12} className="text-[#8D8D8D]" />
          </button>
        )}
      </motion.div>
    );
  }

  // Feed variant (default)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`relative bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden cursor-pointer group hover:shadow-md transition-all ${className}`}
      onClick={handleClick}
    >
      {/* Promoted Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1">
        <Sparkles size={10} className="text-[#FFD700]" />
        <span className="text-[10px] text-white font-medium uppercase tracking-wide">Promoted</span>
      </div>

      {onDismiss && (
        <button type="button" onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 p-1.5 bg-black/30 backdrop-blur-sm rounded-full hover:bg-black/50 transition-colors"
        >
          <X size={12} className="text-white" />
        </button>
      )}

      {/* Image */}
      {imageUrl && (
        <div className="w-full h-40 bg-[#F5F5F5] overflow-hidden">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {sponsorLogo ? (
            <img src={sponsorLogo} alt="Advertisement" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-[#00C300]/10 flex items-center justify-center">
              <Megaphone size={10} className="text-[#00C300]" />
            </div>
          )}
          <span className="text-xs text-[#8D8D8D] font-medium">{sponsorName}</span>
        </div>

        <h4 className="text-base font-bold text-[#111111] mb-1 leading-tight">{title}</h4>
        <p className="text-sm text-[#8D8D8D] mb-4 line-clamp-2">{description}</p>

        <div className="flex items-center justify-between">
          <button type="button" onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="inline-flex items-center gap-1.5 bg-[#111111] hover:bg-[#333333] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            {ctaText}
            <ExternalLink size={12} />
          </button>

          {linkUrl && (
            <span className="text-[10px] text-[#C7C7CC] truncate max-w-[120px]">
              {linkUrl.replace(/^https?:\/\//, '')}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function AdBannerCarousel({
  ads = MOCK_ADS,
  interval = 5000,
  onDismiss,
}: {
  ads?: Omit<AdBannerProps, 'onDismiss' | 'onClick'>[];
  interval?: number;
  onDismiss?: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (ads.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, interval);
    return () => clearInterval(timer);
  }, [ads.length, interval, paused]);

  const currentAd = ads[index];
  if (!currentAd) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AdBanner
        {...currentAd}
        onDismiss={() => onDismiss?.(currentAd.id || '')}
        onClick={() => {
          if (currentAd.linkUrl) {
            window.location.href = currentAd.linkUrl;
          }
        }}
      />

      {ads.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {ads.map((_, i) => (
            <button type="button" key={i}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-full transition-all ${
                i === index ? 'w-4 bg-[#00C300]' : 'w-1.5 bg-[#C7C7CC]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
