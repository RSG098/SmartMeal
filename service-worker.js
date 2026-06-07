// ── Service Worker — Planificateur de repas ───────────────────────────────────
const CACHE_NAME = 'repas-v4';

// Fichiers à mettre en cache pour le mode hors-ligne
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
];

// ── Installation : mise en cache des assets statiques ─────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On essaie de tout mettre en cache, mais on ignore les erreurs
      // (ex: Firebase CDN peut avoir des politiques CORS en install)
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] Impossible de cacher :', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie Network First pour Firebase, Cache First pour le reste ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Laisse passer toutes les requêtes Firebase Firestore sans interception
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com')
  ) {
    return; // Pas d'interception — Firebase gère son propre cache offline
  }

  // Pour les assets statiques : Cache First avec fallback réseau
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // On ne cache que les réponses valides (pas les erreurs)
          if (
            !response ||
            response.status !== 200 ||
            response.type === 'opaque'
          ) {
            return response;
          }

          // Mise en cache dynamique pour les prochaines visites
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, toCache);
          });

          return response;
        })
        .catch(() => {
          // Hors-ligne et pas dans le cache → renvoie l'index pour les navigations
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ── Message : forcer la mise à jour du cache ──────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
