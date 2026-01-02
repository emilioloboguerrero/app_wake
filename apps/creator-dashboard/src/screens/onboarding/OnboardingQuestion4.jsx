import React, { useState } from 'react';
import './OnboardingQuestions.css';
import SvgIcon from '../../components/SvgIcon';

const OnboardingQuestion4 = ({ onAnswer, onNext, onBack, selectedAnswer: initialSelected = null }) => {
  // Icon SVGs for each workout preference (matching mobile app)
  const intenseIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const relaxedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.8291 17.0806C13.9002 21.3232 19.557 15.6663 18.8499 5.0598C8.24352 4.35269 2.58692 10.0097 6.8291 17.0806ZM6.8291 17.0806C6.82902 17.0805 6.82918 17.0807 6.8291 17.0806ZM6.8291 17.0806L5 18.909M6.8291 17.0806L10.6569 13.2522" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const balancedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.5 19H17.5C17.9647 19 18.197 18.9999 18.3902 18.9614C19.1836 18.8036 19.8036 18.1836 19.9614 17.3902C19.9999 17.197 19.9999 16.9647 19.9999 16.5C19.9999 16.0353 19.9999 15.8031 19.9614 15.6099C19.8036 14.8165 19.1836 14.1962 18.3902 14.0384C18.197 14 17.9647 14 17.5 14H6.5C6.03534 14 5.80306 14 5.60986 14.0384C4.81648 14.1962 4.19624 14.8165 4.03843 15.6099C4 15.8031 4 16.0354 4 16.5C4 16.9647 4 17.1969 4.03843 17.3901C4.19624 18.1835 4.81648 18.8036 5.60986 18.9614C5.80306 18.9999 6.03535 19 6.5 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.5 10H17.5C17.9647 10 18.197 9.99986 18.3902 9.96143C19.1836 9.80361 19.8036 9.18356 19.9614 8.39018C19.9999 8.19698 19.9999 7.96465 19.9999 7.5C19.9999 7.03535 19.9999 6.80306 19.9614 6.60986C19.8036 5.81648 19.1836 5.19624 18.3902 5.03843C18.197 5 17.9647 5 17.5 5H6.5C6.03534 5 5.80306 5 5.60986 5.03843C4.81648 5.19624 4.19624 5.81648 4.03843 6.60986C4 6.80306 4 7.03539 4 7.50004C4 7.9647 4 8.19694 4.03843 8.39014C4.19624 9.18352 4.81648 9.80361 5.60986 9.96143C5.80306 9.99986 6.03535 10 6.5 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const variedIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 16L8 19M8 19L5 16M8 19V5M13 8L16 5M16 5L19 8M16 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { 
      id: 1, 
      text: 'Rutinas cortas e intensas', 
      icon: intenseIcon 
    },
    { 
      id: 2, 
      text: 'Sesiones más largas y relajadas', 
      icon: relaxedIcon 
    },
    { 
      id: 3, 
      text: 'Algo equilibrado entre ambas', 
      icon: balancedIcon 
    },
    { 
      id: 4, 
      text: 'Depende del día, me gusta variar', 
      icon: variedIcon 
    },
  ];
  
  const initialId = initialSelected ? options.find(opt => opt.text === initialSelected)?.id : null;
  const [selectedAnswer, setSelectedAnswer] = useState(initialId);

  const handleContinue = () => {
    if (selectedAnswer) {
      const selectedOption = options.find(opt => opt.id === selectedAnswer);
      const workoutPreferenceText = selectedOption ? selectedOption.text : null;
      
      onAnswer('workoutPreference', workoutPreferenceText);
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
          ¿Qué tipo de entrenamientos prefieres?
        </h1>

        <div className="options-grid">
          {options.map((option) => (
            <button
              key={option.id}
              className={`option-cube ${selectedAnswer === option.id ? 'option-cube-selected' : ''}`}
              onClick={() => setSelectedAnswer(option.id)}
            >
              <div className="option-icon">
                <SvgIcon 
                  svgString={option.icon} 
                  width={32} 
                  height={32} 
                  color={selectedAnswer === option.id ? '#BFA84D' : '#ffffff'}
                />
              </div>
              <p className={`option-text ${selectedAnswer === option.id ? 'option-text-selected' : ''}`}>
                {option.text}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="question-actions">
        <button
          className={`question-button ${!selectedAnswer ? 'question-button-disabled' : ''}`}
          onClick={handleContinue}
          disabled={!selectedAnswer}
        >
          <span className={`question-button-text ${!selectedAnswer ? 'question-button-text-disabled' : ''}`}>
            Continuar
          </span>
          <span className={`question-progress ${!selectedAnswer ? 'question-progress-disabled' : ''}`}>
            4 de 5
          </span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingQuestion4;

