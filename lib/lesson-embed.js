// Pure URL-transform helpers — no Firebase/network calls. Used only by
// LessonContentViewer so a lesson's raw video URL is never rendered as
// visible/clickable text, only ever as an iframe embed src.

export function toYouTubeEmbedUrl(url) {
  if (typeof url !== "string") return "";
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return "";
}

export function toDriveEmbedUrl(url) {
  if (typeof url !== "string") return "";
  const match = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  if (!match) return "";
  return `https://drive.google.com/file/d/${match[1]}/preview`;
}

export function isYouTubeUrl(url) {
  return typeof url === "string" && /youtube\.com|youtu\.be/.test(url);
}

export function isDriveUrl(url) {
  return typeof url === "string" && /drive\.google\.com/.test(url);
}

export function isFacebookVideoUrl(url) {
  return typeof url === "string" && /(^https?:\/\/)?([\w-]+\.)?(facebook\.com|fb\.watch)\//i.test(url);
}

// Facebook's own embeddable player for a public video/reel post.
export function toFacebookEmbedUrl(url) {
  if (!isFacebookVideoUrl(url)) return "";
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
}

// One entry point for the public "Exciting New Videos" section (and its
// admin form): YouTube, Facebook or Google Drive → an iframe src, or ""
// when the link isn't one of those three.
export function toVideoEmbedUrl(url) {
  return toYouTubeEmbedUrl(url) || toDriveEmbedUrl(isDriveUrl(url) ? url : "") || toFacebookEmbedUrl(url);
}

// YouTube serves a still for every video — used as the card image when the
// admin didn't upload a picture of their own.
export function youTubeThumbnailUrl(url) {
  const embed = toYouTubeEmbedUrl(url);
  return embed ? `https://img.youtube.com/vi/${embed.split("/").pop()}/hqdefault.jpg` : "";
}
