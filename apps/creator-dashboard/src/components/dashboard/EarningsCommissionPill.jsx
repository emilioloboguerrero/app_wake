import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/apiClient';
import { cacheConfig } from '../../config/queryClient';
import './EarningsCommissionPill.css';

const SERVICE_LABEL = { managed: 'Gestionado por Wake', self_serve: 'Autogestión' };

// Pill for the dashboard toggle row. Shows how the earnings are managed and,
// on click, explains the Wake commission. Reuses the shared earnings query
// (same key as DashboardEarnings) so no extra network call is made.
export default function EarningsCommissionPill() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: res } = useQuery({
    queryKey: ['analytics', 'earnings', user?.uid],
    queryFn: () => apiClient.get('/analytics/earnings'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });
  const data = res?.data;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!data?.serviceType) return null;

  const serviceType = data.serviceType === 'managed' ? 'managed' : 'self_serve';
  const mpPct = Math.round((data.commissionRates?.mercadopago ?? 0) * 100);
  const intlPct = Math.round((data.commissionRates?.polar ?? 0) * 100);
  const managed = serviceType === 'managed';

  return (
    <div className="ecp" ref={ref}>
      <button
        type="button"
        className="ecp-pill"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {SERVICE_LABEL[serviceType]}
      </button>
      {open && (
        <div className="ecp-pop" role="dialog">
          <p className="ecp-pop__title">Comisión Wake</p>
          <p className="ecp-pop__body">
            {managed
              ? 'Wake gestiona los cobros, los impuestos y la plataforma. Tu ganancia es lo que queda después de la comisión.'
              : 'Tú gestionas tu operación. Wake cobra una comisión sobre cada venta.'}
          </p>
          <div className="ecp-pop__rates">
            <div className="ecp-rate">
              <span className="ecp-rate__pct">{mpPct}%</span>
              <span className="ecp-rate__lbl">Ventas locales</span>
            </div>
            <div className="ecp-rate">
              <span className="ecp-rate__pct">{intlPct}%</span>
              <span className="ecp-rate__lbl">Ventas internacionales</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
