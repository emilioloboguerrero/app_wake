import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import GlowingEffect from '../ui/GlowingEffect';
import apiClient from '../../utils/apiClient';
import './DemographicsCard.css';

const DIMENSIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'ciudad', label: 'Ciudad' },
  { id: 'objetivo', label: 'Objetivo' },
  { id: 'experiencia', label: 'Experiencia' },
  { id: 'equipo', label: 'Equipo' },
];

const GOAL_LABELS = {
  fat_loss: 'Perder grasa',
  muscle: 'Ganar musculo',
  performance: 'Rendimiento',
  health: 'Salud',
  event: 'Evento',
};

const EXPERIENCE_LABELS = {
  beginner: 'Principiante',
  less_1yr: '< 1 ano',
  '1_3yrs': '1-3 anos',
  over_3yrs: '3+ anos',
};

const EQUIPMENT_LABELS = {
  full_gym: 'Gimnasio completo',
  home_gym: 'Gym en casa',
  bodyweight: 'Sin equipo',
  mixed: 'Mixto',
};

const GENDER_LABELS = {
  male: 'H',
  female: 'M',
  other: 'Otro',
  no_especificado: '—',
};

const GENDER_COLORS = [
  'rgba(100, 180, 255, 0.7)',
  'rgba(255, 130, 180, 0.7)',
  'rgba(180, 140, 255, 0.7)',
  'rgba(255, 255, 255, 0.2)',
];

function BarRows({ data, labelMap }) {
  const maxCount = Math.max(1, ...Object.values(data));

  const entries = Object.entries(data).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return <p className="demo-card__empty-text">Sin datos</p>;
  }

  return (
    <div className="demo-bars">
      {entries.map(([key, count]) => (
        <div key={key} className="demo-bar-row">
          <span className="demo-bar-row__label">{labelMap?.[key] || key}</span>
          <div className="demo-bar-row__track">
            <div
              className="demo-bar-row__fill"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <span className="demo-bar-row__count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileView({ age, gender }) {
  const genderEntries = useMemo(() => {
    if (!gender) return [];
    return Object.entries(gender)
      .filter(([, count]) => count > 0)
      .map(([key, count], i) => ({
        name: GENDER_LABELS[key] || key,
        value: count,
        color: GENDER_COLORS[i % GENDER_COLORS.length],
      }));
  }, [gender]);

  const ageEntries = age ? Object.entries(age).filter(([, count]) => count > 0) : [];
  const maxAge = Math.max(1, ...ageEntries.map(([, c]) => c));

  if (ageEntries.length === 0 && genderEntries.length === 0) {
    return <p className="demo-card__empty-text">Sin datos</p>;
  }

  return (
    <div className="demo-profile">
      {/* Age bars — compact */}
      <div className="demo-profile__age">
        {ageEntries.map(([key, count]) => (
          <div key={key} className="demo-bar-row demo-bar-row--compact">
            <span className="demo-bar-row__label">{key}</span>
            <div className="demo-bar-row__track">
              <div
                className="demo-bar-row__fill"
                style={{ width: `${(count / maxAge) * 100}%` }}
              />
            </div>
            <span className="demo-bar-row__count">{count}</span>
          </div>
        ))}
      </div>
      {/* Gender donut — small */}
      {genderEntries.length > 0 && (
        <div className="demo-profile__gender">
          <div className="demo-profile__donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genderEntries}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius="50%"
                  outerRadius="90%"
                  paddingAngle={2}
                  isAnimationActive={false}
                  stroke="none"
                >
                  {genderEntries.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="demo-profile__legend">
            {genderEntries.map((entry, idx) => (
              <div key={idx} className="demo-profile__legend-item">
                <span className="demo-profile__legend-dot" style={{ background: entry.color }} />
                <span className="demo-profile__legend-label">{entry.name}</span>
                <span className="demo-profile__legend-value">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CitiesView({ cities }) {
  if (!cities?.length) {
    return <p className="demo-card__empty-text">Sin datos</p>;
  }

  return (
    <div className="demo-cities">
      {cities.map((item, idx) => (
        <div key={item.city} className="demo-city-row">
          <span className="demo-city-row__rank">{idx + 1}</span>
          <span className="demo-city-row__name">{item.city}</span>
          <span className="demo-city-row__count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function DemographicsCard({ programId, accentRgb }) {
  const [activeDim, setActiveDim] = useState('perfil');

  const { data: demographics, isLoading } = useQuery({
    queryKey: ['demographics', 'program', programId],
    queryFn: () => apiClient.get(`/creator/programs/${programId}/demographics`).then(r => r.data),
    enabled: !!programId,
    staleTime: 15 * 60 * 1000,
  });

  const isEmpty = !demographics || demographics.totalEnrolled === 0;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="demo-card__skeleton">
          <div className="demo-card__skeleton-bar" />
          <div className="demo-card__skeleton-bar" />
          <div className="demo-card__skeleton-bar" />
          <div className="demo-card__skeleton-bar" />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="demo-card__empty">
          <svg className="demo-card__empty-icon" viewBox="0 0 24 24" fill="none">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="demo-card__empty-text">Aun no hay usuarios inscritos</p>
        </div>
      );
    }

    switch (activeDim) {
      case 'perfil':
        return <ProfileView age={demographics.age} gender={demographics.gender} />;
      case 'ciudad':
        return <CitiesView cities={demographics.cities} />;
      case 'objetivo':
        return <BarRows data={demographics.goals} labelMap={GOAL_LABELS} />;
      case 'experiencia':
        return <BarRows data={demographics.experience} labelMap={EXPERIENCE_LABELS} />;
      case 'equipo':
        return <BarRows data={demographics.equipment || {}} labelMap={EQUIPMENT_LABELS} />;
      default:
        return null;
    }
  };

  return (
    <div className="demo-card">
      <GlowingEffect spread={20} proximity={60} />
      <div className="demo-card__nav">
        {DIMENSIONS.map(dim => (
          <button
            key={dim.id}
            type="button"
            className={`demo-card__pill ${activeDim === dim.id ? 'demo-card__pill--active' : ''}`}
            onClick={() => setActiveDim(dim.id)}
          >
            {dim.label}
          </button>
        ))}
      </div>
      <div className="demo-card__body">
        {renderContent()}
      </div>
    </div>
  );
}
