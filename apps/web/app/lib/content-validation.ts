import type { ContentState } from './content';
export function validatePublicContent(
  content: Pick<ContentState, 'site' | 'pages' | 'sermons' | 'team'>,
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
  // Fixed-shape records: each entry must keep exactly its named fields.
  const shapes = {
    values: ['number', 'title', 'description'],
    givingImpact: ['percentage', 'title', 'description'],
  } as const;
  for (const [key, fields] of Object.entries(shapes)) {
    const entries = content.pages[key as keyof typeof shapes] as unknown[];
    entries.forEach((entry, index) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== fields.length ||
        entry.some((field) => typeof field !== 'string')
      )
        errors.push(
          `${key} ${index + 1}: must have exactly these fields — ${fields.join(', ')}.`,
        );
      else if (!String(entry[0]).trim() && !String(entry[1]).trim())
        errors.push(
          `${key} ${index + 1}: fill in or remove this empty record.`,
        );
    });
  }
  for (const [key, entries] of Object.entries({
    sermons: content.sermons,
    leadership: content.team,
  }))
    entries.forEach((item) => {
      if (!['draft', 'published', 'archived'].includes(item.status))
        errors.push(`${key}: unsupported visibility "${item.status}".`);
    });
  for (const key of ['locations', 'steps'] as const)
    if (!content.pages[key].length)
      errors.push(`Add at least one ${key} item.`);
  for (const [key, entries] of Object.entries({
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
