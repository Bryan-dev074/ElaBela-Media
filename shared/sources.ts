export function platformForSource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const belongsTo = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (belongsTo('instagram.com')) return 'Instagram';
    if (belongsTo('pinterest.com') || host === 'pin.it') return 'Pinterest';
    if (belongsTo('facebook.com') || host === 'fb.watch') return 'Facebook';
    if (belongsTo('tiktok.com')) return 'TikTok';
    if (belongsTo('youtube.com') || host === 'youtu.be') return 'YouTube';
    return 'Sitio web';
  } catch {
    return 'Fuente por revisar';
  }
}
