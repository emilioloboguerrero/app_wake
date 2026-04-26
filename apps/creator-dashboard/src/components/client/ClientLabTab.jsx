import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { cacheConfig, queryKeys } from '../../config/queryClient';
import TimeRangeSelector from '../ui/TimeRangeSelector';
import { SlidePanel } from '../ui';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import ClientLabBentoGrid from './ClientLabBentoGrid';
import ClientWellnessBand from './ClientWellnessBand';
import ClientVideosTab from './ClientVideosTab';
import './ClientLabTab.css';

const RANGES = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '3 meses' },
];

// Deterministic accent derived from a string when image extraction fails or
// the client has no profile picture. Hue from a stable hash of the seed,
// saturation and lightness fixed so the result feels at home in the dark
// cinematic palette (no neon, no muddy).
function fallbackAccentFor(seed) {
  if (!seed) return [180, 180, 200];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return hslToRgb(hue, 55, 62);
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return [f(0), f(8), f(4)];
}

export default function ClientLabTab({ clientUserId, clientName, creatorId, avatarUrl }) {
  const [range, setRange] = useState('30d');
  const [videosOpen, setVideosOpen] = useState(false);
  const [accent, setAccent] = useState(null);

  // Extract accent from the client's profile picture using the same util the rest
  // of the dashboard uses (events / programs / library cards). The util now
  // calls back with `null` on failure (CORS taint, broken URL, missing file)
  // so we can fall back deterministically below.
  useEffect(() => {
    if (!avatarUrl) {
      setAccent(null);
      return;
    }
    const cleanup = extractAccentFromImage(avatarUrl, setAccent);
    return cleanup;
  }, [avatarUrl]);

  const accentRgb = useMemo(() => {
    if (accent) return accent;
    return fallbackAccentFor(clientUserId || clientName || avatarUrl || '');
  }, [accent, clientUserId, clientName, avatarUrl]);
  const accentCss = `${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}`;
  const containerStyle = useMemo(
    () => ({
      '--accent-rgb': accentCss,
      '--accent': `rgb(${accentCss})`,
      '--accent-soft': `rgba(${accentCss}, 0.18)`,
      '--accent-line': `rgba(${accentCss}, 0.65)`,
      '--accent-fill': `rgba(${accentCss}, 0.25)`,
    }),
    [accentCss]
  );

  // Single analytics call. The previous summary→full split was a net loss:
  // the summary path skipped only diary + exerciseHistory + lastPerf reads
  // but ran the same auth, function init, library batch, body-log scan,
  // photo signing, and course walk twice.
  const { data: labData, isLoading: labLoading } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, range],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=${range}`);
      return res.data || res;
    },
    enabled: !!clientUserId,
    ...cacheConfig.analytics,
  });

  // Video exchanges only fetch when the drawer opens — saves ~1.7s of
  // blocking time on initial page load.
  const { data: allThreads = [] } = useQuery({
    queryKey: [...queryKeys.videoExchanges.byCreator(creatorId)],
    queryFn: async () => {
      const res = await apiClient.get('/video-exchanges');
      return res.data || res;
    },
    enabled: !!creatorId && videosOpen,
    ...cacheConfig.videoExchanges,
  });

  // "Pendiente" = unread by the creator. We deliberately don't include
  // `lastMessageBy === 'client'` here: opening + watching the video should
  // clear the badge, even before the coach responds. The PATCH markRead from
  // the thread view drops unreadByCreator to 0, which invalidates this query
  // and removes the badge automatically.
  const pendingCount = useMemo(() => {
    if (!clientUserId) return 0;
    return allThreads.filter(
      (t) =>
        t.clientId === clientUserId &&
        t.status !== 'closed' &&
        (t.unreadByCreator || 0) > 0
    ).length;
  }, [allThreads, clientUserId]);

  return (
    <div className="clt-container" style={containerStyle}>
      <div className="clt-header">
        <div className="clt-header-left">
          <h2 className="clt-title">Resumen</h2>
        </div>
        <div className="clt-header-right">
          <button
            type="button"
            className={`clt-videos-pill ${pendingCount > 0 ? 'clt-videos-pill--alert' : ''}`}
            onClick={() => setVideosOpen(true)}
          >
            <Video size={14} />
            <span>Videos</span>
            {pendingCount > 0 && (
              <span className="clt-videos-pill-badge">{pendingCount}</span>
            )}
          </button>
          <TimeRangeSelector
            ranges={RANGES}
            activeId={range}
            onChange={setRange}
          />
        </div>
      </div>

      <ClientLabBentoGrid
        data={labData}
        isLoading={labLoading}
        range={range}
        accentRgb={accentRgb}
      />

      <ClientWellnessBand
        data={labData}
        isLoading={labLoading}
        range={range}
        accentRgb={accentRgb}
      />

      <SlidePanel
        open={videosOpen}
        onClose={() => setVideosOpen(false)}
        title="Videos"
        badge={pendingCount > 0 ? `${pendingCount} pendientes` : null}
        width={460}
      >
        <ClientVideosTab creatorId={creatorId} clientUserId={clientUserId} />
      </SlidePanel>
    </div>
  );
}
