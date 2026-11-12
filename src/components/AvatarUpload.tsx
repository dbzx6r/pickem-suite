'use client';

import { useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AvatarUploadProps {
  userId: string;
  displayName: string;
  initialAvatarUrl?: string | null;
  isOwnProfile: boolean;
  size?: 'sm' | 'lg';
}

export default function AvatarUpload({
  displayName,
  initialAvatarUrl,
  isOwnProfile,
  size = 'lg',
}: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClass = size === 'lg' ? 'h-20 w-20' : 'h-8 w-8';
  const textClass = size === 'lg' ? 'text-2xl font-black' : 'text-xs font-bold';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    setUploading(true);
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      const d = await res.json();
      if (res.ok) {
        setAvatarUrl(d.avatarUrl + '?t=' + Date.now());
        toast.success('Profile picture updated');
      } else {
        toast.error(d.error || 'Upload failed');
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative group inline-block">
      <Avatar className={sizeClass}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
        <AvatarFallback className={`bg-primary/20 text-primary ${textClass}`}>
          {initials}
        </AvatarFallback>
      </Avatar>
      {isOwnProfile && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Change profile picture"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  );
}
