import './DailyCalorieBars.css';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function getBarColor(actual, target) {
  if (!actual || !target) return 'var(--dcb-empty)';
  const ratio = actual / target;
  if (ratio >= 0.9 && ratio <= 1.1) return 'var(--dcb-on-track)';
  if (ratio >= 0.8 && ratio <= 1.2) return 'var(--dcb-off)';
  return 'var(--dcb-far-off)';
}

export default function DailyCalorieBars({ days, target }) {
  // days: array of { date, actual, target? } for 7 days (L-D)
  // target: number (daily calorie target)

  const maxVal = Math.max(
    target || 0,
    ...days.map(d => d?.actual || 0)
  );
  const scale = maxVal > 0 ? maxVal * 1.15 : 2500;
  const targetPct = target ? (target / scale) * 100 : 0;

  return (
    <div className="dcb-container">
      <div className="dcb-chart">
        {/* Target line */}
        {target > 0 && (
          <div className="dcb-target-line" style={{ bottom: `${targetPct}%` }}>
            <span className="dcb-target-label">{target}</span>
          </div>
        )}

        {/* Bars */}
        <div className="dcb-bars">
          {DAY_LABELS.map((label, i) => {
            const day = days[i];
            const actual = day?.actual || 0;
            const heightPct = actual > 0 ? (actual / scale) * 100 : 0;
            const color = getBarColor(actual, target);
            const hasData = actual > 0;

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
                      <span className="dcb-bar-value">{Math.round(actual)}</span>
                    </div>
                  ) : (
                    <div className="dcb-bar-empty" />
                  )}
                </div>
                <span className="dcb-bar-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
