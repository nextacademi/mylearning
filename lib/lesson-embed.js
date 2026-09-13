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
