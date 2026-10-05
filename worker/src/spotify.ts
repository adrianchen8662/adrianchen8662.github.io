// Now Playing from Spotify. The refresh token (from scripts/spotify-auth.mjs) is exchanged for short-lived
// access tokens; none of these credentials ever reach the browser.
import type { Env, NowPlaying } from './types.ts';

interface Image {
  url: string;
  width?: number | null;
}

interface Playback {
  is_playing?: boolean;
  currently_playing_type?: string;
  item?: {
    name?: string;
    artists?: { name: string }[];
    album?: { name?: string; images?: Image[] };
    show?: { name?: string; images?: Image[] };
    images?: Image[];
    external_urls?: { spotify?: string };
  } | null;
}

/** The artwork nearest the card's size */
function pickImage(images: Image[] = []) {
  const TARGET = 300;
  const sized = images.filter((image) => image.url);
  return sized.sort((a, b) => Math.abs((a.width ?? TARGET) - TARGET) - Math.abs((b.width ?? TARGET) - TARGET))[0]?.url ?? null;
}

/** What's playing, or null when nothing is: paused, between tracks, or an ad */
export function toNowPlaying(playback: Playback): NowPlaying | null {
  const item = playback.item;
  if (!playback.is_playing || !item?.name) return null;
  const episode = playback.currently_playing_type === 'episode';
  const artist = episode
    ? item.show?.name
    : item.artists?.map((a) => a.name).join(', ');
  return {
    source: 'spotify',
    isPlaying: true,
    track: item.name,
    artist: artist || 'Unknown artist',
    album: episode ? undefined : item.album?.name || undefined,
    cover: pickImage(episode ? item.images ?? item.show?.images : item.album?.images),
    url: item.external_urls?.spotify,
  };
}

let token: { value: string; expiresAt: number } | undefined;
// After Spotify fails, leave it alone for a moment so a flood of visitors doesn't keep hitting it
let pausedUntil = 0;

const TOKEN_KEY = 'spotify_refresh_token';

/** Spotify sometimes hands back a new refresh token; it's kept in D1, tied to the secret it replaced */
async function refreshToken(env: Env) {
  const row = await env.DB.prepare('SELECT value FROM state WHERE key = ?1').bind(TOKEN_KEY).first<{ value: string }>();
  if (row) {
    const saved = JSON.parse(row.value) as { seed: string; token: string };
    // A different secret means I signed in again, which wins over whatever was saved
    if (saved.seed === env.SPOTIFY_REFRESH_TOKEN) return saved.token;
  }
  return env.SPOTIFY_REFRESH_TOKEN!;
}

async function accessToken(env: Env) {
  if (token && token.expiresAt > Date.now() + 30000) return token.value;
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: seed } = env;
  if (!id || !secret || !seed) throw new Error('Spotify is not configured');

  const response = await fetch(`${env.SPOTIFY_ACCOUNTS ?? 'https://accounts.spotify.com'}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: await refreshToken(env) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Spotify's token endpoint answered HTTP ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  if (data.refresh_token && data.refresh_token !== seed) {
    await env.DB
      .prepare('INSERT INTO state (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind(TOKEN_KEY, JSON.stringify({ seed, token: data.refresh_token }))
      .run();
  }
  return token.value;
}

/** What I'm playing on Spotify right now: null when nothing is; throws when Spotify can't say */
export async function currentlyPlaying(env: Env, retried = false): Promise<NowPlaying | null> {
  if (Date.now() < pausedUntil) throw new Error('Spotify is paused after an error');
  try {
    const response = await fetch(`${env.SPOTIFY_API ?? 'https://api.spotify.com/v1'}/me/player/currently-playing?additional_types=episode`, {
      headers: { Authorization: `Bearer ${await accessToken(env)}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 204) return null;
    if (response.status === 401 && !retried) {
      token = undefined;
      return currentlyPlaying(env, true);
    }
    if (response.status === 429) {
      pausedUntil = Date.now() + Math.min(Number(response.headers.get('Retry-After')) || 30, 120) * 1000;
    }
    if (!response.ok) throw new Error(`Spotify answered HTTP ${response.status}`);
    return toNowPlaying((await response.json()) as Playback);
  } catch (error) {
    if (Date.now() >= pausedUntil) pausedUntil = Date.now() + 10000;
    throw error;
  }
}

/** For tests: forgets the cached token and any pause */
export function resetSpotify() {
  token = undefined;
  pausedUntil = 0;
}
