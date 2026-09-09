import { Globe } from 'lucide-react';
import { platformForSource } from '../../shared/sources';

const icons: Record<string, string> = {
  Pinterest: 'pinterest',
  Instagram: 'instagram',
  Facebook: 'facebook',
  TikTok: 'tiktok',
  YouTube: 'youtube',
};

export function SocialSource({ url }: { url: string }) {
  const name = platformForSource(url);
  const icon = icons[name];
  return (
    <span className="social-source" data-platform={icon || 'web'}>
      <span className="social-source-icon" aria-hidden="true">
        {icon ? <img src={`/brand/social/${icon}.svg`} width={14} height={14} alt="" /> : <Globe size={14} />}
      </span>
      {name}
    </span>
  );
}
