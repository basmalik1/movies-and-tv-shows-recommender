import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EpisodeTracker } from "@/components/EpisodeTracker";
import { TitleCard, TitleGrid } from "@/components/TitleCard";
import { TmdbSetupNotice } from "@/components/TmdbSetupNotice";
import { TrackControls } from "@/components/TrackControls";
import { Poster, SectionHeader } from "@/components/ui";
import { backdropUrl, profileUrl } from "@/lib/tmdb/images";
import { isTvDetail, normalizeDetail, normalizeSearchResult } from "@/lib/tmdb/normalize";
import { getMovie, getTvShow, hasTmdbCredentials } from "@/lib/tmdb/server";
import type {
  MediaType,
  NormalizedTitle,
  TmdbMovieDetail,
  TmdbTitleDetail,
  TmdbTvDetail,
} from "@/lib/tmdb/types";

interface PageParams {
  params: Promise<{ mediaType: string; id: string }>;
}

async function loadDetail(mediaType: string, rawId: string): Promise<TmdbTitleDetail | null> {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  try {
    return mediaType === "tv" ? await getTvShow(id) : await getMovie(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { mediaType, id } = await params;
  if (!hasTmdbCredentials()) return { title: "Set up TMDB" };

  const detail = await loadDetail(mediaType, id);
  if (!detail) return { title: "Not found" };

  const normalized = normalizeDetail(detail);
  return {
    title: normalized.year ? `${normalized.title} (${normalized.year})` : normalized.title,
    description: normalized.overview.slice(0, 160) || undefined,
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-widest text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-200">{value}</dd>
    </div>
  );
}

function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export default async function TitlePage({ params }: PageParams) {
  const { mediaType: rawMediaType, id } = await params;

  if (!hasTmdbCredentials()) return <TmdbSetupNotice />;

  const detail = await loadDetail(rawMediaType, id);
  if (!detail) notFound();

  const tv = isTvDetail(detail);
  const mediaType: MediaType = tv ? "tv" : "movie";
  const normalized = normalizeDetail(detail);
  const backdrop = backdropUrl(normalized.backdropPath);

  const keywords = tv
    ? (detail.keywords?.results ?? [])
    : ((detail as TmdbMovieDetail).keywords?.keywords ?? []);

  const cast = (detail.credits?.cast ?? []).slice(0, 10);
  const directors = (detail.credits?.crew ?? []).filter((member) => member.job === "Director");
  const creators = tv ? (detail.created_by ?? []) : [];

  const runtime = formatRuntime(
    tv ? detail.episode_run_time?.[0] : (detail as TmdbMovieDetail).runtime,
  );

  const related: NormalizedTitle[] = [
    ...(detail.recommendations?.results ?? []),
    ...(detail.similar?.results ?? []),
  ]
    .map((result) => normalizeSearchResult(result, mediaType))
    .filter((title): title is NormalizedTitle => title !== null)
    .filter(
      (title, index, all) =>
        all.findIndex((other) => other.tmdbId === title.tmdbId) === index &&
        title.tmdbId !== normalized.tmdbId,
    )
    .slice(0, 12);

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      <div className="relative">
        {backdrop && (
          <div className="absolute inset-0 h-[340px] overflow-hidden">
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/80 to-ink-950" />
          </div>
        )}

        <div className="relative px-4 pt-10 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="relative aspect-[2/3] w-40 shrink-0 self-start overflow-hidden rounded-xl border border-ink-700 shadow-2xl sm:w-52">
              <Poster
                path={normalized.posterPath}
                alt={normalized.title}
                priority
                sizes="(max-width: 640px) 160px, 208px"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-accent-400">
                {tv ? "Series" : "Film"}
                {normalized.year ? ` · ${normalized.year}` : ""}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-4xl">
                {normalized.title}
              </h1>
              {detail.tagline && (
                <p className="mt-1.5 text-sm italic text-ink-400">{detail.tagline}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(detail.genres ?? []).map((genre) => (
                  <span key={genre.id} className="chip">
                    {genre.name}
                  </span>
                ))}
              </div>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-200">
                {normalized.overview || "No synopsis available."}
              </p>

              <div className="mt-6">
                <TrackControls detail={detail} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-10 px-4 py-10 sm:px-6 lg:px-10">
        <dl className="grid grid-cols-2 gap-5 border-y border-ink-800 py-5 sm:grid-cols-4">
          <Fact
            label="TMDB rating"
            value={`${normalized.voteAverage.toFixed(1)} / 10 · ${normalized.voteCount.toLocaleString()} votes`}
          />
          {runtime && <Fact label={tv ? "Episode length" : "Runtime"} value={runtime} />}
          {tv ? (
            <Fact
              label="Length"
              value={`${detail.number_of_seasons ?? "?"} seasons · ${detail.number_of_episodes ?? "?"} episodes`}
            />
          ) : (
            <Fact
              label="Released"
              value={(detail as TmdbMovieDetail).release_date || "Unannounced"}
            />
          )}
          <Fact label="Status" value={detail.status ?? "Unknown"} />
          {creators.length > 0 && (
            <Fact label="Created by" value={creators.map((person) => person.name).join(", ")} />
          )}
          {directors.length > 0 && (
            <Fact label="Directed by" value={directors.map((person) => person.name).join(", ")} />
          )}
        </dl>

        {tv && <EpisodeTracker show={detail as TmdbTvDetail} />}

        {cast.length > 0 && (
          <section>
            <SectionHeader title="Cast" />
            <div className="flex gap-3 overflow-x-auto pb-2">
              {cast.map((member) => {
                const photo = profileUrl(member.profile_path);
                return (
                  <div key={`${member.id}-${member.character}`} className="w-24 shrink-0">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-ink-800">
                      {photo ? (
                        <Image
                          src={photo}
                          alt={member.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center p-2 text-center text-[0.65rem] text-ink-400">
                          {member.name}
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[0.72rem] font-medium leading-snug text-ink-200">
                      {member.name}
                    </p>
                    {member.character && (
                      <p className="line-clamp-2 text-[0.68rem] leading-snug text-ink-400">
                        {member.character}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {keywords.length > 0 && (
          <section>
            <SectionHeader
              title="Themes"
              hint="These tags are what the recommender matches on"
            />
            <div className="flex flex-wrap gap-1.5">
              {keywords.slice(0, 24).map((keyword) => (
                <span key={keyword.id} className="chip">
                  {keyword.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <SectionHeader title="More like this" />
            <TitleGrid>
              {related.map((title) => (
                <TitleCard
                  key={`${title.mediaType}-${title.tmdbId}`}
                  tmdbId={title.tmdbId}
                  mediaType={title.mediaType}
                  title={title.title}
                  posterPath={title.posterPath}
                  year={title.year}
                />
              ))}
            </TitleGrid>
          </section>
        )}
      </div>
    </div>
  );
}
