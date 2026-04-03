import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { cacheConfig } from '../../config/queryClient';
import TimeRangeSelector from '../ui/TimeRangeSelector';
import ClientLabBentoGrid from './ClientLabBentoGrid';
import ClientLabDetailSections from './ClientLabDetailSections';
import VideoExchangeSection from './VideoExchangeSection';
import './ClientLabTab.css';

const RANGES = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '3 meses' },
];

export default function ClientLabTab({ clientId, clientUserId, clientName, creatorId }) {
  const [range, setRange] = useState('30d');

  // Phase 1: Summary (fast, ~60 reads — skips diary + exerciseHistory)
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, range, 'summary'],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=${range}&fields=summary`);
      return res.data || res;
    },
    enabled: !!clientUserId,
    ...cacheConfig.analytics,
  });

  // Phase 2: Full data (heavier, ~210 reads — includes diary + exerciseHistory)
  const { data: fullData, isLoading: fullLoading } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, range],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=${range}`);
      return res.data || res;
    },
    enabled: !!clientUserId,
    ...cacheConfig.analytics,
  });

  // Merge: use full data when available, fall back to summary for bento grid
  const labData = fullData || summaryData;
  const bentoLoading = summaryLoading;
  const detailLoading = !fullData;

  return (
    <div className="clt-container">
      {/* ── Header row with time range selector ──────────────── */}
      <div className="clt-header">
        <h2 className="clt-title">Resumen</h2>
        <TimeRangeSelector
          ranges={RANGES}
          activeId={range}
          onChange={setRange}
        />
      </div>

      {/* ── Bento Grid (renders with summary data, fast) ─────── */}
      <ClientLabBentoGrid
        data={labData}
        isLoading={bentoLoading}
        range={range}
      />

      {/* ── Detail Sections (waits for full data) ────────────── */}
      <ClientLabDetailSections
        data={fullData}
        isLoading={detailLoading}
        clientName={clientName}
        range={range}
      />

      {/* ── Video Exchanges ────────────────────────────────────── */}
      <VideoExchangeSection
        clientId={clientId}
        clientUserId={clientUserId}
        creatorId={creatorId}
        oneOnOneClientId={clientId}
      />
    </div>
  );
}
