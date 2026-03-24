import { SkeletonCard, FullScreenError } from '../ui';

export default function PanelShell({
  isLoading,
  isError,
  isEmpty,
  emptyTitle = 'Sin contenido',
  emptySub = '',
  emptyCta = '',
  onRetry,
  onCta,
  skeletonType = 'list',
  skeletonCount = 6,
  renderSkeleton,
  children,
}) {
  if (isLoading) {
    if (renderSkeleton) return renderSkeleton();
    const cls = skeletonType === 'grid' ? 'bib-skeleton-grid' : 'bib-skeleton-list';
    return (
      <div className={cls}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <FullScreenError
        title="Algo salio mal"
        message="Revisa tu conexion e intenta de nuevo."
        onRetry={onRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <div className="bib-empty">
        <div className="bib-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="bib-empty-title">{emptyTitle}</p>
        {emptySub && <p className="bib-empty-sub">{emptySub}</p>}
        {emptyCta && onCta && (
          <button className="bib-empty-cta" onClick={onCta}>
            {emptyCta}
          </button>
        )}
      </div>
    );
  }

  return <div className="bib-panel-enter">{children}</div>;
}
