/** Narrow, hand-written subset of the TMDB API surface this app actually uses. */

export type MediaType = "movie" | "tv";

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

/** Shape shared by search results and list endpoints, for both movies and shows. */
export interface TmdbSearchResult {
  id: number;
  media_type?: MediaType | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
}

export interface TmdbPaginated<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface TmdbCredits {
  cast?: TmdbCastMember[];
  crew?: TmdbCrewMember[];
}

export interface TmdbEpisode {
  id: number;
  name: string;
  overview?: string;
  season_number: number;
  episode_number: number;
  air_date?: string | null;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
}

export interface TmdbSeasonSummary {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
  overview?: string;
}

export interface TmdbSeasonDetail extends TmdbSeasonSummary {
  episodes: TmdbEpisode[];
}

export interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  runtime?: number | null;
  status?: string;
  genres?: TmdbGenre[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  credits?: TmdbCredits;
  keywords?: { keywords?: TmdbKeyword[] };
  recommendations?: TmdbPaginated<TmdbSearchResult>;
  similar?: TmdbPaginated<TmdbSearchResult>;
}

export interface TmdbTvDetail {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  last_air_date?: string | null;
  episode_run_time?: number[];
  status?: string;
  in_production?: boolean;
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: TmdbGenre[];
  seasons?: TmdbSeasonSummary[];
  next_episode_to_air?: TmdbEpisode | null;
  last_episode_to_air?: TmdbEpisode | null;
  created_by?: { id: number; name: string }[];
  networks?: { id: number; name: string; logo_path?: string | null }[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  credits?: TmdbCredits;
  keywords?: { results?: TmdbKeyword[] };
  recommendations?: TmdbPaginated<TmdbSearchResult>;
  similar?: TmdbPaginated<TmdbSearchResult>;
}

export type TmdbTitleDetail = TmdbMovieDetail | TmdbTvDetail;

/** Normalized view over a movie or show, so UI code never branches on media type. */
export interface NormalizedTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** ISO date of theatrical release / first air date. */
  date: string | null;
  year: number | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  originalLanguage: string;
}
