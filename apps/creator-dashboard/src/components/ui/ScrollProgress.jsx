import { motion, useScroll } from 'motion/react';
import './ScrollProgress.css';

export default function ScrollProgress({
  className = '',
  containerRef,
  style,
  ...props
}) {
  const { scrollYProgress } = useScroll(
    containerRef ? { container: containerRef } : undefined
  );

  return (
    <motion.div
      className={`scroll-progress ${className}`}
      style={{ scaleX: scrollYProgress, ...style }}
      {...props}
    />
  );
}
