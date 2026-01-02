import React from 'react';
import './OnboardingQuestions.css';

const OnboardingComplete = ({ onComplete }) => {
  return (
    <div className="onboarding-complete-container">
      <div className="complete-content">
        <div className="complete-logo-container">
          <img
            src="/wake-isotipo-negativo.png"
            alt="Wake Logo"
            className="complete-logo"
            onError={(e) => {
              e.target.src = '/wake-isotipo.png';
            }}
          />
        </div>

        <h1 className="complete-message">
          Wake es donde mides lo que antes solo sentías.{'\n\n'}
          Donde los mejores atletas te ayudan a progresar.
        </h1>

        <button
          className="complete-button"
          onClick={onComplete}
        >
          <span className="complete-button-text">Empezar</span>
        </button>
      </div>
    </div>
  );
};

export default OnboardingComplete;

