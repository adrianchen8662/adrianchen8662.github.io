// One-time helper: signs in to Spotify and prints the refresh token the Worker uses.
//
//   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run auth
//
// The Spotify app needs this redirect URI (Spotify requires the loopback IP, not "localhost"):
//   http://127.0.0.1:8888/callback
// Run it on your own computer: it opens a local web server for the sign-in to come back to.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// All the Worker asks for: what's playing right now. It can't see playlists, your profile or your email.
const SCOPE = 'user-read-currently-playing';

if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first, from your app at https://developer.spotify.com/dashboard:');
  console.error('  SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run auth');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: REDIRECT,
  scope: SCOPE,
  state,
  show_dialog: 'true',
}).toString();

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${body}</p>`;

async function exchange(code) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.refresh_token) {
    throw new Error(`Spotify answered HTTP ${response.status}: ${data.error_description ?? data.error ?? 'no refresh token'}`);
  }
  return data.refresh_token;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', REDIRECT);
  if (url.pathname !== '/callback') {
    response.writeHead(404).end();
    return;
  }
  const finish = (code, title, body, error) => {
    response.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, body));
    server.close();
    if (error) {
      console.error(`\n${error}`);
      process.exitCode = 1;
    }
  };

  if (url.searchParams.get('state') !== state) return finish(400, 'Something is off', 'The sign-in did not match this session. Run the command again.', 'The state did not match, so the sign-in was ignored. Run the command again.');
  if (url.searchParams.get('error')) return finish(400, 'Not signed in', `Spotify said: ${url.searchParams.get('error')}.`, `Spotify said: ${url.searchParams.get('error')}.`);

  try {
    const token = await exchange(url.searchParams.get('code') ?? '');
    finish(200, 'Done', 'You can close this tab and go back to the terminal.');
    console.log('\nYour refresh token (keep it private; it lets anyone see what you are playing):\n');
    console.log(`  ${token}\n`);
    console.log('Give the Worker its three Spotify secrets, from the worker/ folder. Each command asks for the value:\n');
    console.log('  npx wrangler secret put SPOTIFY_CLIENT_ID');
    console.log('  npx wrangler secret put SPOTIFY_CLIENT_SECRET');
    console.log('  npx wrangler secret put SPOTIFY_REFRESH_TOKEN\n');
  } catch (error) {
    finish(500, 'Could not finish', 'Spotify would not give a token. See the terminal.', String(error.message ?? error));
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use; close whatever is using it and try again.` : String(error));
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this address in your browser and approve access:\n');
  console.log(`  ${authorize}\n`);
  console.log(`Waiting for Spotify to send you back to ${REDIRECT} ...`);
});

setTimeout(() => {
  console.error('\nTimed out after 5 minutes. Run the command again.');
  process.exit(1);
}, 5 * 60 * 1000).unref();
