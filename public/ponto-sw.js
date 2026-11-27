/**
 * Service Worker offline-first do AgueroFlow Ponto (/?ponto=1 e /ponto).
 * - Faz cache apenas dos 3 modelos leves (6.5 MB total) para bater ponto sem internet na obra.
 * - Nunca faz cache de rotas /api/* (a fila offline de marcações é gerida pelo IndexedDB assinado).
 */
const CACHE_NAME = 'agueroflow-ponto-v3';
const MODEL_ASSETS = [
  '/ponto-models/tiny_face_detector_model-weights_manifest.json',
  '/ponto-models/tiny_face_detector_model.bin',
  '/ponto-models/face_landmark_68_tiny_model-weights_manifest.json',
  '/ponto-models/face_landmark_68_tiny_model.bin',
  '/ponto-models/face_recognition_model-weights_manifest.json',
  '/ponto-models/face_recognition_model.bin',
  '/ponto-manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(MODEL_ASSETS.map((url) => cache.add(url))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/ponto-models/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return resp;
        });
      }),
    );
    return;
  }

  if (req.mode === 'navigate' || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/?ponto=1') || caches.match('/'))),
    );
  }
});
