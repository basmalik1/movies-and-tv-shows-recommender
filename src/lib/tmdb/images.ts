const IMAGE_BASE = "https://image.tmdb.org/t/p";

export type PosterSize = "w154" | "w185" | "w342" | "w500" | "original";
export type BackdropSize = "w780" | "w1280" | "original";
export type StillSize = "w185" | "w300" | "original";
export type ProfileSize = "w45" | "w185" | "original";

export function posterUrl(path: string | null | undefined, size: PosterSize = "w342") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null | undefined, size: BackdropSize = "w1280") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function stillUrl(path: string | null | undefined, size: StillSize = "w300") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function profileUrl(path: string | null | undefined, size: ProfileSize = "w185") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}
