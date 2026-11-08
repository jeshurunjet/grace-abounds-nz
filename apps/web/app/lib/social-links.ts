export type SocialPlatform = 'facebook' | 'instagram' | 'youtube';

export type SocialLink = {
  platform: SocialPlatform;
  label: string;
  href: string;
};

/**
 * Front-end fallback data. A future CMS adapter can return this same shape
 * without requiring changes to the footer component.
 */
export const socialLinks: SocialLink[] = [
  {
    platform: 'facebook',
    label: 'Facebook',
    href: 'https://www.facebook.com/',
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/',
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/',
  },
];
