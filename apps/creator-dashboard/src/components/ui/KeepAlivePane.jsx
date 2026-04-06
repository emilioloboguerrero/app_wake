import { useRef, useEffect } from 'react';

export default function KeepAlivePane({ active, children, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e) => {
      if (e.target.style) e.target.style.animation = 'none';
    };
    el.addEventListener('animationend', handler);
    return () => el.removeEventListener('animationend', handler);
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={active ? undefined : { display: 'none' }}
    >
      {children}
    </div>
  );
}
