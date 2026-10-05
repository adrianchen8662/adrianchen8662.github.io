// ListenBrainz API helpers shared by the About page's cards. fetchJSON and coverUrl come from
// prcutler/listenbrainz-widget (MIT); the license notice is in src/components/ListenBrainzCard.tsx.

export const API = 'https://api.listenbrainz.org/1';

export interface TrackMetadata {
  track_name?: string;
  artist_name?: string;
  release_name?: string;
  mbid_mapping?: {
    caa_release_mbid?: string;
    caa_id?: number;
    release_mbid?: string;
    artists?: { artist_credit_name: string }[];
  };
  additional_info?: { release_mbid?: string; artist_names?: string[]; release_artist_name?: string };
}

export interface Listen {
  listened_at?: number;
  track_metadata?: TrackMetadata;
}

export async function fetchJSON(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function coverUrl(meta: TrackMetadata) {
  const m = meta.mbid_mapping ?? {};
  if (m.caa_release_mbid && m.caa_id != null) {
    return `https://archive.org/download/mbid-${m.caa_release_mbid}/mbid-${m.caa_release_mbid}-${m.caa_id}_thumb250.jpg`;
  }
  const release = m.release_mbid ?? meta.additional_info?.release_mbid;
  return release ? `https://coverartarchive.org/release/${release}/front-250` : null;
}
