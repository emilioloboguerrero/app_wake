import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { FullScreenError } from '../components/ui/ErrorStates';
import { SkeletonCard } from '../components/ui';
import './AdminSalesScreen.css';

const fmtCOP = (n) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(n ?? 0);

function StatCard({ label, value, sub }) {
  return (
    <div className="as-stat">
      <p className="as-stat__label">{label}</p>
      <p className="as-stat__value">{value}</p>
      {sub && <p className="as-stat__sub">{sub}</p>}
    </div>
  );
}

function CreatorCard({ c }) {
  return (
    <div className="as-creator">
      <div className="as-creator__head">
        <div className="as-creator__id">
          <p className="as-creator__name">{c.name}</p>
          <p className="as-creator__email">{c.email}</p>
        </div>
        <div className="as-creator__totals">
          <span className="as-creator__rev">{fmtCOP(c.revenueCOP)}</span>
          <span className="as-creator__meta">{c.activeMembers} activos · {c.sales} ventas</span>
        </div>
      </div>
      <div className="as-programs">
        {c.programs.map((p) => (
          <div key={p.courseId} className="as-program">
            <span className="as-program__title">{p.title}</span>
            <span className="as-program__meta">{fmtCOP(p.revenueCOP)} · {p.active} activos · {p.sales} ventas</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AdminSalesScreen = () => {
  const { isAdmin } = useAuth();
  const { data: res, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'platform-sales'],
    queryFn: () => apiClient.get('/analytics/admin/platform'),
    enabled: isAdmin,
    staleTime: 2 * 60 * 1000,
  });

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const data = res?.data;

  return (
    <DashboardLayout screenName="Ventas · Plataforma">
      <div className="as-wrap">
        {isLoading && <div className="as-stats">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>}
        {isError && <FullScreenError title="No se pudo cargar" message="Intenta de nuevo." onRetry={refetch} />}
        {data && (
          <>
            <div className="as-stats">
              <StatCard label="Ingreso total" value={fmtCOP(data.platform.totalCOP)} sub="cursos + plataforma" />
              <StatCard label="Ventas de cursos" value={fmtCOP(data.platform.courseRevenueCOP)} />
              <StatCard label="Wake Creadores · B2B" value={fmtCOP(data.platform.b2bRevenueCOP)} sub={`${data.platform.b2bPayments} pagos`} />
              <StatCard label="Miembros activos" value={data.platform.activeMembers} sub={`${data.platform.creatorCount} creadores`} />
            </div>

            <p className="as-section-title">Por creador</p>
            <div className="as-creators">
              {data.creators.map((c) => <CreatorCard key={c.creatorId} c={c} />)}
            </div>

            <p className="as-note">
              Ventas en COP desde MercadoPago (la fuente real de dinero, histórico completo). Los cobros internacionales (Polar/USD) se muestran aparte en el dashboard de cada creador.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminSalesScreen;
