import './Marquee.css';

export default function Marquee({
  className = '',
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  style,
  ...props
}) {
  const trackClass = [
    'marquee__track',
    reverse && 'marquee__track--reverse',
    pauseOnHover && 'marquee__track--pause-on-hover',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`marquee ${vertical ? 'marquee--vertical' : ''} ${className}`}
      style={style}
      {...props}
    >
      {Array.from({ length: repeat }, (_, i) => (
        <div key={i} className={trackClass}>
          {children}
        </div>
      ))}
    </div>
  );
}
