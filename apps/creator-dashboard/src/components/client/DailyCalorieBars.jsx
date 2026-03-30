import './DailyCalorieBars.css';

const SHORT_DAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function getBarColor(actual, target) {
  if (!actual || !target) return 'var(--dcb-empty)';
  const ratio = actual / target;
  if (ratio >= 0.9 && ratio <= 1.1) return 'var(--dcb-on-track)';
  if (ratio >= 0.8 && ratio <= 1.2) return 'var(--dcb-off)';
  return 'var(--dcb-far-off)';
}

function formatLabel(day, count) {
  if (!day?.date) return '';
  if (count <= 7) {
    const d = new Date(day.date + 'T12:00:00');
    return SHORT_DAY[d.getDay()];
  }
  const parts = day.date.split('-');
  return `${parseInt(parts[2])}`;
}

export default function DailyCalorieBars({ days, target }) {
  const count = days.length;
  const compact = count > 7;

  const maxVal = Math.max(
    target || 0,
    ...days.map(d => d?.actual || 0)
  );
  const scale = maxVal > 0 ? maxVal * 1.15 : 2500;
  const targetPct = target ? (target / scale) * 100 : 0;

  return (
    <div className="dcb-container">
      <div className={`dcb-chart ${compact ? 'dcb-chart--compact' : ''}`}>
        {target > 0 && (
          <div className="dcb-target-line" style={{ bottom: `${targetPct}%` }}>
            <span className="dcb-target-label">{target}</span>
          </div>
        )}

        <div className="dcb-bars">
          {days.map((day, i) => {
            const actual = day?.actual || 0;
            const heightPct = actual > 0 ? (actual / scale) * 100 : 0;
            const color = getBarColor(actual, target);
            const hasData = actual > 0;
            const label = formatLabel(day, count);
            const showLabel = !compact || i % 5 === 0 || i === count - 1;

            return (
              <div key={i} className="dcb-bar-col">
                <div className="dcb-bar-track">
                  {hasData ? (
                    <div
                      className="dcb-bar-fill"
                      style={{
                        height: `${heightPct}%`,
                        background: color,
                      }}
                    >
                      {!compact && <span className="dcb-bar-value">{Math.round(actual)}</span>}
                    </div>
                  ) : (
                    <div className="dcb-bar-empty" />
                  )}
                </div>
                <span className="dcb-bar-label">{showLabel ? label : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
