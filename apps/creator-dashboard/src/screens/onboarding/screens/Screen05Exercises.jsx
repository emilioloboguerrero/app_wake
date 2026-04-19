import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];

const categories = [
  { name: 'Fuerza', exercises: ['Sentadilla', 'Press banca', 'Peso muerto', 'Hip thrust'] },
  { name: 'Cardio', exercises: ['Correr', 'Remo', 'Saltar cuerda', 'Burpees'] },
  { name: 'Movilidad', exercises: ['Cat-cow', 'Pigeon stretch', '90/90', 'World greatest'] },
];

export default function Screen05Exercises() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>En la biblioteca, armas tu <Bold>coleccion de ejercicios</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', gap: 16 }}>
          {categories.map((cat, catIndex) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 40, rotate: catIndex === 0 ? -1.5 : catIndex === 2 ? 1.5 : 0 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.7, ease, delay: 0.3 + catIndex * 0.12 }}
              style={{ borderRadius: 16 }}
            >
              <GlowCard style={{ borderRadius: 16 }}>
                <div style={{
                  width: 200, borderRadius: 16,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: "'Inter'", fontWeight: 600 }}>{cat.name}</span>
                    <span style={{
                      color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 500,
                      padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)',
                    }}>{cat.exercises.length}</span>
                  </div>
                  {cat.exercises.map((name, i) => (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, ease, delay: 0.55 + catIndex * 0.12 + i * 0.06 }}
                      style={{
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: "'Inter'", fontWeight: 500 }}>{name}</span>
                    </motion.div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
