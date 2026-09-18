import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { lazyRetry } from '@/lib/lazyRetry';

// Route-level code splitting: each page ships in its own chunk.
// Pages use named exports, so each lazy call maps it to a default.
const HomePage = lazyRetry(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const LibraryPage = lazyRetry(() => import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const DiscoverPage = lazyRetry(() => import('@/pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const SearchPage = lazyRetry(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const PlaylistSquarePage = lazyRetry(() => import('@/pages/PlaylistSquarePage').then((m) => ({ default: m.PlaylistSquarePage })));
const PlaylistDetailPage = lazyRetry(() => import('@/pages/PlaylistDetailPage').then((m) => ({ default: m.PlaylistDetailPage })));
const UserPlaylistDetailPage = lazyRetry(() => import('@/pages/UserPlaylistDetailPage').then((m) => ({ default: m.UserPlaylistDetailPage })));
const NeteasePlaylistDetailPage = lazyRetry(() => import('@/pages/NeteasePlaylistDetailPage').then((m) => ({ default: m.NeteasePlaylistDetailPage })));
const QqChartDetailPage = lazyRetry(() => import('@/pages/QqChartDetailPage').then((m) => ({ default: m.QqChartDetailPage })));
const AlbumDetailPage = lazyRetry(() => import('@/pages/AlbumDetailPage').then((m) => ({ default: m.AlbumDetailPage })));
const ArtistDetailPage = lazyRetry(() => import('@/pages/ArtistDetailPage').then((m) => ({ default: m.ArtistDetailPage })));
const SettingsPage = lazyRetry(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MePage = lazyRetry(() => import('@/pages/MePage').then((m) => ({ default: m.MePage })));
const StatsPage = lazyRetry(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const AiPage = lazyRetry(() => import('@/pages/AiPage').then((m) => ({ default: m.AiPage })));
const LocalMusicPage = lazyRetry(() => import('@/pages/LocalMusicPage').then((m) => ({ default: m.LocalMusicPage })));
const HistoryPage = lazyRetry(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const StoragePage = lazyRetry(() => import('@/pages/StoragePage').then((m) => ({ default: m.StoragePage })));
const NeteaseAlbumDetailPage = lazyRetry(() => import('@/pages/NeteaseAlbumDetailPage').then((m) => ({ default: m.NeteaseAlbumDetailPage })));
const LoginPage = lazyRetry(
    () => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
  );
  const NeteaseArtistDetailPage = lazyRetry(() => import('@/pages/NeteaseArtistDetailPage').then((m) => ({ default: m.NeteaseArtistDetailPage })));
// Polish layer loaded last so it wins cascade ties; Monet + Miuix above all.
import '@/styles/ui-refresh.css';
import '@/styles/monet.css';
import '@/styles/settings-miuix.css';
import '@/styles/a11y.css';
import '@/styles/halcyon-global.css';

function PageFallback() {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}
    >
      <div className="am-spinner" aria-label="加载中" />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/playlists" element={<PlaylistSquarePage />} />
            <Route path="/playlist/:id" element={<PlaylistDetailPage />} />
            <Route path="/my-playlist/:id" element={<UserPlaylistDetailPage />} />
            <Route path="/ne-playlist/:id" element={<NeteasePlaylistDetailPage />} />
            <Route path="/chart/netease/:id" element={<NeteasePlaylistDetailPage />} />
            <Route path="/chart/qq/:topId" element={<QqChartDetailPage />} />
            <Route path="/album/:id" element={<AlbumDetailPage />} />
            <Route path="/artist/:id" element={<ArtistDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/ai" element={<AiPage />} />
            <Route path="/local" element={<LocalMusicPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/ne-album/:id" element={<NeteaseAlbumDetailPage />} />
            <Route path="/ne-artist/:id" element={<NeteaseArtistDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
