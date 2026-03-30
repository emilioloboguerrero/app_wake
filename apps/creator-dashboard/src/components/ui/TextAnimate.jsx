import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const staggerTimings = {
  text: 0.06,
  word: 0.05,
  character: 0.03,
  line: 0.06,
};

const defaultContainerVariants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { delayChildren: 0, staggerChildren: 0.05 },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
};

const presets = {
  fadeIn: {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: 20, transition: { duration: 0.3 } },
  },
  blurIn: {
    hidden: { opacity: 0, filter: 'blur(10px)' },
    show: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.3 } },
    exit: { opacity: 0, filter: 'blur(10px)', transition: { duration: 0.3 } },
  },
  blurInUp: {
    hidden: { opacity: 0, filter: 'blur(10px)', y: 20 },
    show: {
      opacity: 1, filter: 'blur(0px)', y: 0,
      transition: { y: { duration: 0.3 }, opacity: { duration: 0.4 }, filter: { duration: 0.3 } },
    },
    exit: {
      opacity: 0, filter: 'blur(10px)', y: 20,
      transition: { y: { duration: 0.3 }, opacity: { duration: 0.4 }, filter: { duration: 0.3 } },
    },
  },
  blurInDown: {
    hidden: { opacity: 0, filter: 'blur(10px)', y: -20 },
    show: {
      opacity: 1, filter: 'blur(0px)', y: 0,
      transition: { y: { duration: 0.3 }, opacity: { duration: 0.4 }, filter: { duration: 0.3 } },
    },
  },
  slideUp: {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { y: -20, opacity: 0, transition: { duration: 0.3 } },
  },
  slideDown: {
    hidden: { y: -20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { y: 20, opacity: 0, transition: { duration: 0.3 } },
  },
  slideLeft: {
    hidden: { x: 20, opacity: 0 },
    show: { x: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { x: -20, opacity: 0, transition: { duration: 0.3 } },
  },
  slideRight: {
    hidden: { x: -20, opacity: 0 },
    show: { x: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { x: 20, opacity: 0, transition: { duration: 0.3 } },
  },
  scaleUp: {
    hidden: { scale: 0.5, opacity: 0 },
    show: {
      scale: 1, opacity: 1,
      transition: { duration: 0.3, scale: { type: 'spring', damping: 15, stiffness: 300 } },
    },
    exit: { scale: 0.5, opacity: 0, transition: { duration: 0.3 } },
  },
  scaleDown: {
    hidden: { scale: 1.5, opacity: 0 },
    show: {
      scale: 1, opacity: 1,
      transition: { duration: 0.3, scale: { type: 'spring', damping: 15, stiffness: 300 } },
    },
    exit: { scale: 1.5, opacity: 0, transition: { duration: 0.3 } },
  },
};

function TextAnimateBase({
  children,
  delay = 0,
  duration = 0.3,
  variants: customVariants,
  className = '',
  segmentClassName = '',
  as: Component = 'p',
  startOnView = true,
  once = true,
  by = 'word',
  animation = 'fadeIn',
  style,
  ...props
}) {
  const MotionComponent = motion[Component] || motion.p;

  let segments = [];
  switch (by) {
    case 'word':      segments = children.split(/(\s+)/); break;
    case 'character': segments = children.split('');       break;
    case 'line':      segments = children.split('\n');     break;
    case 'text':
    default:          segments = [children];               break;
  }

  const preset = presets[animation] || presets.fadeIn;

  const finalVariants = customVariants
    ? {
        container: {
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              opacity: { duration: 0.01, delay },
              delayChildren: delay,
              staggerChildren: duration / segments.length,
            },
          },
          exit: {
            opacity: 0,
            transition: {
              staggerChildren: duration / segments.length,
              staggerDirection: -1,
            },
          },
        },
        item: customVariants,
      }
    : {
        container: {
          ...defaultContainerVariants,
          show: {
            ...defaultContainerVariants.show,
            transition: {
              delayChildren: delay,
              staggerChildren: duration / segments.length,
            },
          },
          exit: {
            ...defaultContainerVariants.exit,
            transition: {
              staggerChildren: duration / segments.length,
              staggerDirection: -1,
            },
          },
        },
        item: preset,
      };

  return (
    <AnimatePresence mode="popLayout">
      <MotionComponent
        variants={finalVariants.container}
        initial="hidden"
        whileInView={startOnView ? 'show' : undefined}
        animate={startOnView ? undefined : 'show'}
        exit="exit"
        className={className}
        viewport={{ once }}
        style={{ whiteSpace: 'pre-wrap', ...style }}
        aria-label={children}
        {...props}
      >
        <span style={{
          position: 'absolute', width: 1, height: 1, padding: 0,
          margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap', borderWidth: 0,
        }}>
          {children}
        </span>
        {segments.map((segment, i) => (
          <motion.span
            key={`${by}-${segment}-${i}`}
            variants={finalVariants.item}
            custom={i * staggerTimings[by]}
            style={{
              display: by === 'line' ? 'block' : 'inline-block',
              whiteSpace: by === 'line' ? undefined : 'pre',
            }}
            className={segmentClassName}
            aria-hidden
          >
            {segment}
          </motion.span>
        ))}
      </MotionComponent>
    </AnimatePresence>
  );
}

const TextAnimate = memo(TextAnimateBase);
export default TextAnimate;
