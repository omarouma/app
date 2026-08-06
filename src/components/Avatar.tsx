import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}

export default function Avatar({ src, alt = 'Avatar', size = 40, className }: AvatarProps) {
  const [error, setError] = useState(false);

  const handleError = () => {
    setError(true);
  };

  const initials = alt.split(' ').map(n => n[0]).join('').substring(0, 2);

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-bold overflow-hidden',
        className
      )}
      style={{ width: size, height: size, fontSize: size / 2.5 }}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt}
          onError={handleError}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}