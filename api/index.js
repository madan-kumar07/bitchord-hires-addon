import { searchAll, resolveStream, health } from '../lib/router.js';

const MANIFEST = {
  id: 'dev.akira.bitchord-hires',
  name: 'Tamil Hi-Res FLAC',
  version: '1.0.1',
  resources: ['search', 'stream'],
  // Follow the README: only show this addon for lossless-capable outputs.
  checkValidLossless: 1,
  allowDownloads: 1,
  settings: [
    {
      key: 'quality',
      type: 'select',
      default: 'lossless',
      options: [
        { label: 'Hi-Res FLAC (up to 24-bit / 192 kHz)', value: 'lossless' },
        { label: 'CD Lossless FLAC (16-bit / 44.1 kHz)', value: 'high' },
        { label: 'Low (MP3 320)', value: 'low' },
      ],
    },
  ],
};

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Vercel rewrites public addon paths to this function. Preserve the original
  // path in __path so the router still sees /manifest.json, /health, etc.
  const forwardedPath = url.searchParams.get('__path');
  const path = (forwardedPath || url.pathname).replace(/\\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method not allowed' }, { Allow: 'GET, OPTIONS' });
  }

  if (path === '/' || path === '/manifest.json') {
    return json(res, 200, MANIFEST);
  }

  if (path === '/health') {
    try {
      const report = await health();
      return json(res, 200, report);
    } catch (err) {
      return json(res, 500, { ok: false, error: String(err?.message || err) });
    }
  }

  if (path === '/search') {
    const query = url.searchParams.get('q') || '';
    if (!query.trim()) return json(res, 200, { tracks: [] });

    try {
      const { tracks, perSource } = await searchAll(query, url.searchParams.get('quality'));
      return json(res, 200, { tracks }, { 'X-Addon-Sources': encodeURIComponent(JSON.stringify(perSource)) });
    } catch (err) {
      return json(res, 200, { tracks: [], error: String(err?.message || err) });
    }
  }

  if (path.startsWith('/stream/')) {
    const id = decodeURIComponent(path.slice('/stream/'.length));
    if (!id) return json(res, 404, { error: 'missing id' });

    const stream = await resolveStream(id, url.searchParams.get('quality'));
    if (!stream) return json(res, 404, { error: 'not available in this addon' });

    return json(res, 200, stream);
  }

  return json(res, 404, { error: 'not found' });
}