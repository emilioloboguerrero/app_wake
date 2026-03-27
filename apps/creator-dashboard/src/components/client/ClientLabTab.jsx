import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import TimeRangeSelector from '../ui/TimeRangeSelector';
import ClientLabBentoGrid from './ClientLabBentoGrid';
import ClientLabDetailSections from './ClientLabDetailSections';
import './ClientLabTab.css';

const RANGES = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '3 meses' },
];

export default function ClientLabTab({ clientId, clientUserId, clientName, creatorId }) {
  const [range, setRange] = useState('30d');

  const { data: labData, isLoading, error } = useQuery({
    queryKey: ['analytics', 'client-lab', clientUserId, range],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/client/${clientUserId}/lab?range=${range}`);
      return res.data || res;
    },
    enabled: !!clientUserId,
    staleTime: 2 * 60 * 1000,
  });

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

      {/* ── Bento Grid ───────────────────────────────────────── */}
      <ClientLabBentoGrid
        data={labData}
        isLoading={isLoading}
        range={range}
      />

      {/* ── Detail Sections ──────────────────────────────────── */}
      <ClientLabDetailSections
        data={labData}
        isLoading={isLoading}
        clientName={clientName}
        range={range}
      />
    </div>
  );
}
