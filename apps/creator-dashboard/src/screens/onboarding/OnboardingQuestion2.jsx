import React, { useState } from 'react';
import './OnboardingQuestions.css';
import SvgIcon from '../../components/SvgIcon';

const OnboardingQuestion2 = ({ onAnswer, onNext, onBack, selectedAnswers: initialSelected = [] }) => {
  // Icon SVGs for each activity type (matching mobile app)
  const dumbbellIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" color="#000000" fill="none">
    <path d="M2.01792 20.3051C3.14656 21.9196 8.05942 23.1871 10.3797 20.1645C12.8894 21.3649 17.0289 20.9928 20.3991 19.1134C20.8678 18.8521 21.3112 18.5222 21.5827 18.0593C22.1957 17.0143 22.2102 15.5644 21.0919 13.4251C19.2274 8.77072 15.874 4.68513 14.5201 3.04212C14.2421 2.78865 12.4687 2.42868 11.3872 2.08279C10.9095 1.93477 10.02 1.83664 8.95612 3.23862C8.45176 3.90329 6.16059 5.5357 9.06767 6.63346C9.51805 6.74806 9.84912 6.95939 11.9038 6.58404C12.1714 6.53761 12.8395 6.58404 13.3103 7.41041L14.2936 8.81662C14.3851 8.94752 14.4445 9.09813 14.4627 9.25682C14.635 10.7557 14.6294 12.6323 15.4651 13.5826C14.1743 12.6492 10.8011 11.5406 8.2595 14.6951M2.00189 12.94C3.21009 11.791 6.71197 9.97592 10.4179 12.5216" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;

  const runningIcon = `<svg width="40" height="40" viewBox="0 0 89 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M74.2571 53L27.8477 53C15.6233 53 9.51115 53 5.78557 48.345C-1.28584 39.5094 6.77155 16.0158 11.6524 7.16667C13.3071 17.1667 30.3416 16.8889 36.5467 15.5C32.4124 7.17161 37.9314 4.39219 40.6909 3.00247L40.6958 3C53.002 17.5833 79.3138 25.5166 85.762 41.4119C88.5474 48.278 80.6111 53 74.2571 53Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.00195 36.3335C20.3547 42.2893 31.0477 44.0178 44.759 39.6832C48.9137 38.3698 50.9911 37.7131 52.2859 37.8022C53.5807 37.8913 56.2223 39.1231 61.5053 41.5868C68.103 44.6636 77.1566 46.4349 86.3353 41.9932" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50.918 17.5835L57.168 11.3335" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M59.252 23.8335L65.502 17.5835" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const yogaIcon = `<svg fill="currentColor" height="38" width="38" viewBox="0 0 399.421 399.421" xmlns="http://www.w3.org/2000/svg">
    <path d="M390.421,90.522h-25.905c-0.123-0.003-0.249-0.003-0.372,0h-25.901c-4.971,0-9,4.029-9,9s4.029,9,9,9h17.087v19.085
    l-170.319,64.885H95.949l-22.765-31.203h14.013c4.971,0,9-4.029,9-9s-4.029-9-9-9H55.684c-0.144-0.004-0.287-0.004-0.431,0H35.021
    c-4.971,0-9,4.029-9,9s4.029,9,9,9h15.882l22.765,31.203H9c-4.971,0-9,4.029-9,9v98.409c0,4.971,4.029,9,9,9h42.09
    c4.971,0,9-4.029,9-9v-47.32h253.151v47.32c0,4.971,4.029,9,9,9h42.09c4.971,0,9-4.029,9-9v-98.409c0-0.063,0-0.127-0.002-0.191
    v-67.284c0.003-0.139,0.003-0.278,0-0.418v-25.076h17.091c4.971,0,9-4.029,9-9S395.392,90.522,390.421,90.522z M355.33,146.869
    v45.623H235.572L355.33,146.869z M42.09,290.901H18v-38.32h24.09V290.901z M355.332,290.901h-24.09v-38.32h24.09V290.901z
     M355.332,234.581h-33.09H18v-24.089h73.28c0.068,0.001,0.135,0.001,0.203,0h94.981c0.137,0.003,0.273,0.003,0.41,0h168.458V234.581
    z"/>
  </svg>`;

  const teamIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const wellnessIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { 
      id: 1, 
      text: 'Entrenamiento de fuerza / gimnasio', 
      icon: dumbbellIcon 
    },
    { 
      id: 2, 
      text: 'Cardio (Running, ciclismo, natación, etc.)', 
      icon: runningIcon 
    },
    { 
      id: 3, 
      text: 'Yoga o pilates', 
      icon: yogaIcon 
    },
    { 
      id: 4, 
      text: 'Deportes (Tenis, golf, boxeo, etc.)', 
      icon: teamIcon 
    },
    { 
      id: 5, 
      text: 'Movilidad o bienestar general', 
      icon: wellnessIcon 
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
      } else if (prev.length < 3) {
        return [...prev, optionId];
      } else {
        return [prev[1], prev[2], optionId];
      }
    });
  };

  const handleContinue = () => {
    if (selectedAnswers.length > 0) {
      const selectedInterests = selectedAnswers.map(id => {
        const option = options.find(opt => opt.id === id);
        return option ? option.text : null;
      }).filter(Boolean);
      
      onAnswer('interests', selectedInterests);
      onNext();
    }
  };

  return (
    <div className="onboarding-question-container">
      <div className="question-header">
        <img 
          src="/wake-logo-new.png" 
          alt="Wake Logo" 
          className="question-logo"
        />
      </div>

      <div className="question-content">
        <h1 className="question-title">
          ¿Qué tipo de actividades o disciplinas te interesan más?
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
                  width={option.id === 2 ? 40 : option.id === 3 ? 38 : 32} 
                  height={option.id === 2 ? 40 : option.id === 3 ? 38 : 32} 
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
            {selectedAnswers.length} de 3 seleccionado{selectedAnswers.length > 1 ? 's' : ''}
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
            2 de 5
          </span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingQuestion2;

