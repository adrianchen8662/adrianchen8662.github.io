-- Every ListenBrainz listen since the start of last year's window, one row each. The cron job only ever adds rows.
CREATE TABLE listens (
  listened_at  INTEGER NOT NULL,        -- seconds since the epoch
  track        TEXT    NOT NULL,        -- '' when ListenBrainz has no track name
  artist       TEXT    NOT NULL,
  album        TEXT    NOT NULL DEFAULT '',
  album_artist TEXT    NOT NULL DEFAULT '',
  artists      TEXT    NOT NULL,        -- JSON array of every artist credited on the track
  cover        TEXT,
  PRIMARY KEY (listened_at, track, artist)
) WITHOUT ROWID;

-- The Most Played counts for each range, rebuilt by the cron job and served as they are
CREATE TABLE snapshots (
  range_id    TEXT PRIMARY KEY,
  body        TEXT    NOT NULL,         -- JSON
  computed_at INTEGER NOT NULL
);

-- Bookkeeping: when the last sync worked or failed, and a Spotify refresh token if Spotify rotated it
CREATE TABLE state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
