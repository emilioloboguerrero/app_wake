import React, { useState } from 'react';
import './OnboardingQuestions.css';
import SvgIcon from '../../components/SvgIcon';
import { ASSET_BASE } from '../../config/assets';

const OnboardingQuestion1 = ({ onAnswer, onNext, selectedAnswers: initialSelected = [] }) => {
  // Icon SVGs (matching mobile app)
  const heartIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.2373 6.23731C20.7839 7.78395 20.8432 10.2727 19.3718 11.8911L11.9995 20.0001L4.62812 11.8911C3.15679 10.2727 3.21605 7.7839 4.76269 6.23726C6.48961 4.51034 9.33372 4.66814 10.8594 6.5752L12 8.00045L13.1396 6.57504C14.6653 4.66798 17.5104 4.51039 19.2373 6.23731Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const flagIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const targetIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
  </svg>`;

  const muscleIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" color="#000000" fill="none">
    <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;

  const usersIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { 
      id: 1, 
      text: 'Ganar más energía y sentirme mejor en mi día a día', 
      icon: heartIcon 
    },
    { 
      id: 2, 
      text: 'Alcanzar una meta específica (competencia, carrera, evento)', 
      icon: flagIcon 
    },
    { 
      id: 3, 
      text: 'Perder peso o grasa corporal', 
      icon: targetIcon 
    },
    { 
      id: 4, 
      text: 'Ganar músculo o fuerza', 
      icon: muscleIcon 
    },
    { 
      id: 5, 
      text: 'Conocer gente nueva y ser parte de una comunidad', 
      icon: usersIcon 
    },
  ];
  
  // Convert text array to ID array
  const initialIds = (initialSelected || []).map(text => {
    const option = options.find(opt => opt.text === text);
    return option ? option.id : null;
  }).filter(id => id !== null);
  
  const [selectedAnswers, setSelectedAnswers] = useState(initialIds);

  const handleOptionSelect = (optionId) => {
    setSelectedAnswers(prev => {
      if (prev.includes(optionId)) {
        return prev.filter(id => id !== optionId);
      } else if (prev.length < 2) {
        return [...prev, optionId];
      } else {
        return [prev[1], optionId];
      }
    });
  };

  const handleContinue = () => {
    if (selectedAnswers.length > 0) {
      const selectedMotivations = selectedAnswers.map(id => {
        const option = options.find(opt => opt.id === id);
        return option ? option.text : null;
      }).filter(Boolean);
      
      onAnswer('motivation', selectedMotivations);
      onNext();
    }
  };

  return (
    <div className="onboarding-question-container">
      <div className="question-header">
        <img 
          src={`${ASSET_BASE}wake-logo-new.png`} 
          alt="Wake Logo" 
          className="question-logo"
        />
      </div>

      <div className="question-content">
        <h1 className="question-title">
          ¿Cuál es tu motivación principal para hacer deporte?
        </h1>

        <div className="options-grid">
          {options.map((option) => (
            <button
              key={option.id}
              className={`option-cube ${selectedAnswers.includes(option.id) ? 'option-cube-selected' : ''}`}
              onClick={() => handleOptionSelect(option.id)}
            >
              <div className="option-icon">
                <SvgIcon 
                  svgString={option.icon} 
                  width={32} 
                  height={32} 
                  color={selectedAnswers.includes(option.id) ? '#BFA84D' : '#ffffff'}
                />
              </div>
              <p className={`option-text ${selectedAnswers.includes(option.id) ? 'option-text-selected' : ''}`}>
                {option.text}
              </p>
            </button>
          ))}
        </div>

        {selectedAnswers.length > 0 && (
          <p className="selection-info">
            {selectedAnswers.length} de 2 seleccionado{selectedAnswers.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="question-actions">
        <button
          className={`question-button ${selectedAnswers.length === 0 ? 'question-button-disabled' : ''}`}
          onClick={handleContinue}
          disabled={selectedAnswers.length === 0}
        >
          <span className={`question-button-text ${selectedAnswers.length === 0 ? 'question-button-text-disabled' : ''}`}>
            Continuar
          </span>
          <span className={`question-progress ${selectedAnswers.length === 0 ? 'question-progress-disabled' : ''}`}>
            1 de 5
          </span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingQuestion1;

