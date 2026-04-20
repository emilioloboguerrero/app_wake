const BUCKET = 'wolf-20b8b.firebasestorage.app';
const PREFIX = 'app_resources/creator_hero_clips/';

let cached = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

function toDownloadUrl(name) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(name)}?alt=media`;
}

export async function getCreatorHeroClips() {
  if (cached && Date.now() - cachedAt < CACHE_TTL) return cached;
  try {
    const listUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(PREFIX)}`;
    const res = await fetch(listUrl);
    if (!res.ok) return cached || [];
    const json = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    const urls = items
      .filter((it) => it.name && it.name !== PREFIX)
      .map((it) => toDownloadUrl(it.name));
    cached = urls;
    cachedAt = Date.now();
    return urls;
  } catch {
    return cached || [];
  }
}
