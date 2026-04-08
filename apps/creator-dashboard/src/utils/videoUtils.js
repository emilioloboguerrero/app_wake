const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_REGEX = /(?:vimeo\.com\/)(\d+)/;

export function detectVideoSource(url, source) {
  if (source === 'youtube' || source === 'vimeo' || source === 'upload') return source;
  if (!url) return null;
  if (YOUTUBE_REGEX.test(url)) return 'youtube';
  if (VIMEO_REGEX.test(url)) return 'vimeo';
  return 'upload';
}

export function extractYouTubeId(url) {
  const match = url?.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

export function extractVimeoId(url) {
  const match = url?.match(VIMEO_REGEX);
  return match ? match[1] : null;
}

export function getEmbedUrl(url, source) {
  const type = source || detectVideoSource(url);
  if (type === 'youtube') {
    const id = extractYouTubeId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` : null;
  }
  if (type === 'vimeo') {
    const id = extractVimeoId(url);
    return id ? `https://player.vimeo.com/video/${id}?byline=0&portrait=0&title=0` : null;
  }
  return null;
}

export function isValidExternalVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return YOUTUBE_REGEX.test(trimmed) || VIMEO_REGEX.test(trimmed);
}
