import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import './TagsSelector.css';

/**
 * Animated multi-select tag picker.
 *
 * @param {Array<{ id: string, label: string }>} tags - all available options
 * @param {string[]} value - currently selected tag ids (controlled)
 * @param {(ids: string[]) => void} onChange - called with updated id array
 * @param {string} [label] - optional header label
 * @param {string} [placeholder] - text when nothing is selected
 * @param {string} [className] - extra class on root
 */
export function TagsSelector({
  tags,
  value = [],
  onChange,
  label,
  placeholder = 'Selecciona opciones...',
  className = '',
}) {
  const stripRef = useRef(null);

  const selectedSet = new Set(value);

  const addTag = useCallback(
    (id) => onChange([...value, id]),
    [value, onChange]
  );

  const removeTag = useCallback(
    (id) => onChange(value.filter((v) => v !== id)),
    [value, onChange]
  );

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollTo({
        left: stripRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [value]);

  const available = tags.filter((t) => !selectedSet.has(t.id));

  return (
    <div className={`tags-selector ${className}`}>
      {label && (
        <motion.span className="tags-selector__label" layout>
          {label}
        </motion.span>
      )}

      <motion.div
        className={`tags-selector__selected${value.length === 0 ? ' tags-selector__selected--empty' : ''}`}
        ref={stripRef}
        layout
      >
        {value.length === 0 && (
          <span className="tags-selector__empty-text">{placeholder}</span>
        )}
        <AnimatePresence mode="popLayout">
          {value.map((id) => {
            const tag = tags.find((t) => t.id === id);
            if (!tag) return null;
            return (
              <motion.div
                key={tag.id}
                className="tags-selector__chip"
                layoutId={`tag-${tag.id}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.span
                  className="tags-selector__chip-label"
                  layoutId={`tag-${tag.id}-label`}
                >
                  {tag.label}
                </motion.span>
                <button
                  className="tags-selector__chip-remove"
                  onClick={() => removeTag(tag.id)}
                  aria-label={`Quitar ${tag.label}`}
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {available.length > 0 && (
        <motion.div className="tags-selector__options" layout>
          <motion.div className="tags-selector__options-inner">
            <AnimatePresence mode="popLayout">
              {available.map((tag) => (
                <motion.button
                  key={tag.id}
                  className="tags-selector__option"
                  layoutId={`tag-${tag.id}`}
                  onClick={() => addTag(tag.id)}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.span
                    className="tags-selector__option-label"
                    layoutId={`tag-${tag.id}-label`}
                  >
                    {tag.label}
                  </motion.span>
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
