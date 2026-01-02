import React, { useState } from 'react';
import './OnboardingQuestions.css';
import SvgIcon from '../../components/SvgIcon';

const OnboardingQuestion5 = ({ onAnswer, onNext, onBack, selectedAnswer: initialSelected = null }) => {
  // Icon SVGs for each obstacle (matching mobile app)
  const timeIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const knowledgeIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const motivationIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.33496 10.3368C2.02171 10.0471 2.19187 9.52339 2.61557 9.47316L8.61914 8.76107C8.79182 8.74059 8.94181 8.63215 9.01465 8.47425L11.5469 2.98446C11.7256 2.59703 12.2764 2.59695 12.4551 2.98439L14.9873 8.47413C15.0601 8.63204 15.2092 8.74077 15.3818 8.76124L21.3857 9.47316C21.8094 9.52339 21.9791 10.0472 21.6659 10.3369L17.2278 14.4419C17.1001 14.56 17.0433 14.7357 17.0771 14.9063L18.255 20.8359C18.3382 21.2544 17.8928 21.5787 17.5205 21.3703L12.2451 18.4166C12.0934 18.3317 11.9091 18.3321 11.7573 18.417L6.48144 21.3695C6.10913 21.5779 5.66294 21.2544 5.74609 20.8359L6.92414 14.9066C6.95803 14.7361 6.90134 14.5599 6.77367 14.4419L2.33496 10.3368Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const planIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { 
      id: 1, 
      text: 'Falta de tiempo', 
      icon: timeIcon 
    },
    { 
      id: 2, 
      text: 'No saber por dónde empezar', 
      icon: knowledgeIcon 
    },
    { 
      id: 3, 
      text: 'Falta de motivación o constancia', 
      icon: motivationIcon 
    },
    { 
      id: 4, 
      text: 'No tener un plan o guía claros', 
      icon: planIcon 
    },
  ];
  
  const initialId = initialSelected ? options.find(opt => opt.text === initialSelected)?.id : null;
  const [selectedAnswer, setSelectedAnswer] = useState(initialId);

  const handleContinue = () => {
    if (selectedAnswer) {
      const selectedOption = options.find(opt => opt.id === selectedAnswer);
      const obstaclesText = selectedOption ? selectedOption.text : null;
      
      onAnswer('obstacles', obstaclesText);
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
          ¿Qué es lo que más te ha impedido alcanzar tus objetivos antes?
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
            5 de 5
          </span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingQuestion5;

