import type { ContentState } from './content';
export function validatePublicContent(
  content: Pick<ContentState, 'site' | 'pages' | 'events' | 'sermons' | 'team'>,
): string[] {
  const errors: string[] = [];
  const safeLink = (value: string) =>
    /^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/.test(value);
  const image = (value: string) =>
    /^\/images\/[^\s]+$/.test(value) ||
    /^https:\/\/images\.unsplash\.com\/[^\s]+$/.test(value);
  const scan = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scan(entry, `${path} ${index + 1}`));
      return;
    }
    if (value && typeof value === 'object')
      Object.entries(value).forEach(([key, entry]) => {
        const field = `${path} · ${key}`;
        if (typeof entry === 'string') {
          if (/image$/i.test(key) && !image(entry))
            errors.push(
              `${field}: use a local /images/ path or an images.unsplash.com HTTPS URL.`,
            );
          if (/href$|url$/i.test(key) && entry && !safeLink(entry))
            errors.push(`${field}: use an HTTPS URL or a local path.`);
        }
        scan(entry, field);
      });
  };
  scan(content, 'Website');
  content.site.memberOpportunities
    .split('\n')
    .filter(Boolean)
    .forEach((line) => {
      const href = line.split('|')[2]?.trim();
      if (href && !safeLink(href))
        errors.push('Member opportunities: use an HTTPS URL or a local path.');
    });
  for (const key of ['heroImages', 'gallery'] as const) {
    if (!content.pages[key].length)
      errors.push(`Add at least one ${key} image.`);
    content.pages[key].forEach((src) => {
      if (!image(src))
        errors.push(
          `${key}: use a local /images/ path or an images.unsplash.com HTTPS URL.`,
        );
    });
  }
  for (const key of ['locations', 'steps'] as const)
    if (!content.pages[key].length)
      errors.push(`Add at least one ${key} item.`);
  for (const [key, entries] of Object.entries({
    events: content.events,
    sermons: content.sermons,
  })) {
    const slugs = new Set<string>();
    entries.forEach((item) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || slugs.has(item.slug))
        errors.push(`${key}: ${item.title} needs a unique lowercase URL slug.`);
      slugs.add(item.slug);
      if (!item.title.trim()) errors.push(`${key}: a title is required.`);
      if (!Number.isFinite(Date.parse(item.date)))
        errors.push(`${key}: ${item.title} needs a valid date.`);
    });
  }
  content.pages.resources.forEach((item) => {
    if (!item.title.trim() || !safeLink(item.url))
      errors.push('Each resource needs a title and a usable download URL.');
  });
  return [...new Set(errors)];
}
