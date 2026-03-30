import './AnimatedCircularProgressBar.css';

export default function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  size = 120,
  strokeWidth = 10,
  gaugePrimaryColor = 'rgba(255, 255, 255, 0.85)',
  gaugeSecondaryColor = 'rgba(255, 255, 255, 0.08)',
  showLabel = true,
  label,
  className = '',
  style,
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const percentPx = circumference / 100;
  const currentPercent = Math.round(((value - min) / (max - min)) * 100);

  const gapPercent = 5;
  const offsetFactor = 0;
  const percentToDeg = 3.6; // deg per percent

  const primaryDasharray = `${currentPercent * percentPx}px ${circumference}px`;
  const primaryTransform = `rotate(${-90 + gapPercent * offsetFactor * percentToDeg}deg)`;

  const secondaryStrokePercent = 90 - currentPercent;
  const secondaryOffsetFactor = 1 - offsetFactor;
  const secondaryDasharray = `${secondaryStrokePercent * percentPx}px ${circumference}px`;
  const secondaryTransform = `rotate(${360 - 90 - gapPercent * percentToDeg * secondaryOffsetFactor}deg) scaleY(-1)`;

  const transitionStyle = `all var(--transition-length) ease var(--delay)`;

  return (
    <div
      className={`circular-progress ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        fill="none"
        strokeWidth="2"
        viewBox="0 0 100 100"
      >
        {/* Secondary (background) arc */}
        {currentPercent <= 90 && currentPercent >= 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            strokeWidth={strokeWidth}
            strokeDashoffset="0"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{
              stroke: gaugeSecondaryColor,
              strokeDasharray: secondaryDasharray,
              transform: secondaryTransform,
              transition: transitionStyle,
              transformOrigin: '50px 50px',
            }}
          />
        )}

        {/* Primary (value) arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{
            stroke: gaugePrimaryColor,
            strokeDasharray: primaryDasharray,
            transition: `stroke-dasharray var(--transition-length) ease var(--delay), transform var(--transition-length) ease var(--delay), stroke var(--transition-length) ease var(--delay)`,
            transform: primaryTransform,
            transformOrigin: '50px 50px',
          }}
        />
      </svg>

      {/* Label */}
      {showLabel && (
        <span
          className="circular-progress__label"
          style={{ fontSize: size * 0.2 }}
        >
          {label !== undefined ? label : `${currentPercent}%`}
        </span>
      )}
    </div>
  );
}
