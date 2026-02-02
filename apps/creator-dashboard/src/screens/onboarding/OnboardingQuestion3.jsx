import React, { useState } from 'react';
import { ASSET_BASE } from '../../config/assets';
import './OnboardingQuestions.css';
import SvgIcon from '../../components/SvgIcon';

const OnboardingQuestion3 = ({ onAnswer, onNext, onBack, selectedAnswer: initialSelected = null }) => {
  // Icon SVGs for each activity level (matching mobile app)
  const sedentaryIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 11.4522V16.8002C4 17.9203 4 18.4807 4.21799 18.9086C4.40973 19.2849 4.71547 19.5906 5.0918 19.7823C5.5192 20.0001 6.07899 20.0001 7.19691 20.0001H16.8031C17.921 20.0001 18.48 20.0001 18.9074 19.7823C19.2837 19.5906 19.5905 19.2849 19.7822 18.9086C20 18.4811 20 17.9216 20 16.8037V11.4522C20 10.9179 19.9995 10.6506 19.9346 10.4019C19.877 10.1816 19.7825 9.97307 19.6546 9.78464C19.5102 9.57201 19.3096 9.39569 18.9074 9.04383L14.1074 4.84383C13.3608 4.19054 12.9875 3.86406 12.5674 3.73982C12.1972 3.63035 11.8026 3.63035 11.4324 3.73982C11.0126 3.86397 10.6398 4.19014 9.89436 4.84244L5.09277 9.04383C4.69064 9.39569 4.49004 9.57201 4.3457 9.78464C4.21779 9.97307 4.12255 10.1816 4.06497 10.4019C4 10.6506 4 10.9179 4 11.4522Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const moderateIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.2373 6.23731C20.7839 7.78395 20.8432 10.2727 19.3718 11.8911L11.9995 20.0001L4.62812 11.8911C3.15679 10.2727 3.21605 7.7839 4.76269 6.23726C6.48961 4.51034 9.33372 4.66814 10.8594 6.5752L12 8.00045L13.1396 6.57504C14.6653 4.66798 17.5104 4.51039 19.2373 6.23731Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const activeIcon = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.33496 10.3368C2.02171 10.0471 2.19187 9.52339 2.61557 9.47316L8.61914 8.76107C8.79182 8.74059 8.94181 8.63215 9.01465 8.47425L11.5469 2.98446C11.7256 2.59703 12.2764 2.59695 12.4551 2.98439L14.9873 8.47413C15.0601 8.63204 15.2092 8.74077 15.3818 8.76124L21.3857 9.47316C21.8094 9.52339 21.9791 10.0472 21.6659 10.3369L17.2278 14.4419C17.1001 14.56 17.0433 14.7357 17.0771 14.9063L18.255 20.8359C18.3382 21.2544 17.8928 21.5787 17.5205 21.3703L12.2451 18.4166C12.0934 18.3317 11.9091 18.3321 11.7573 18.417L6.48144 21.3695C6.10913 21.5779 5.66294 21.2544 5.74609 20.8359L6.92414 14.9066C6.95803 14.7361 6.90134 14.5599 6.77367 14.4419L2.33496 10.3368Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const options = [
    { 
      id: 1, 
      text: 'Paso la mayor parte del día sentado', 
      icon: sedentaryIcon 
    },
    { 
      id: 2, 
      text: 'Tengo una rutina moderadamente activa', 
      icon: moderateIcon 
    },
    { 
      id: 3, 
      text: 'Ya hago ejercicio con regularidad, pero quiero un plan más enfocado', 
      icon: activeIcon 
    },
  ];
  
  const initialId = initialSelected ? options.find(opt => opt.text === initialSelected)?.id : null;
  const [selectedAnswer, setSelectedAnswer] = useState(initialId);

  const handleContinue = () => {
    if (selectedAnswer) {
      const selectedOption = options.find(opt => opt.id === selectedAnswer);
      const activityLevelText = selectedOption ? selectedOption.text : null;
      
      onAnswer('activityLevel', activityLevelText);
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
          ¿Cómo describirías tu nivel de actividad diaria?
        </h1>

        <div className="options-grid options-grid-full">
          {options.map((option) => (
            <button
              key={option.id}
              className={`option-cube option-cube-full ${selectedAnswer === option.id ? 'option-cube-selected' : ''}`}
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
              <p className={`option-text option-text-full ${selectedAnswer === option.id ? 'option-text-selected' : ''}`}>
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
            3 de 5
          </span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingQuestion3;

