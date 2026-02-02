import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { completeWebOnboarding, updateUser, getUser } from '../services/firestoreService';
import profilePictureService from '../services/profilePictureService';
import cardService from '../services/cardService';
import { ASSET_BASE } from '../config/assets';
import Input from '../components/Input';
import Button from '../components/Button';
import './CreatorOnboardingScreen.css';

const CreatorOnboardingScreen = () => {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Profile picture state
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const fileInputRef = useRef(null);
  
  // Card state
  const [cardTitle, setCardTitle] = useState('');
  const [cardMedia, setCardMedia] = useState(null);
  const [cardMediaPreview, setCardMediaPreview] = useState(null);
  const [cardMediaType, setCardMediaType] = useState(null); // 'image' or 'video'
  const [cardUploadProgress, setCardUploadProgress] = useState(0);
  const [isCardUploading, setIsCardUploading] = useState(false);
  const cardMediaInputRef = useRef(null);
  
  // User gender for welcome message
  const [userGender, setUserGender] = useState(null);

  // Fetch user gender when component mounts
  useEffect(() => {
    const fetchUserGender = async () => {
      if (user) {
        try {
          const userData = await getUser(user.uid);
          setUserGender(userData?.gender || null);
        } catch (error) {
          console.error('Error fetching user gender:', error);
        }
      }
    };
    fetchUserGender();
  }, [user]);

  // Get welcome message based on gender
  const getWelcomeMessage = () => {
    if (!userGender) return '¡Bienvenid@!';
    const gender = userGender.toLowerCase();
    if (gender === 'male' || gender === 'masculino') {
      return '¡Bienvenido!';
    } else if (gender === 'female' || gender === 'femenino') {
      return '¡Bienvenida!';
    } else {
      return '¡Bienvenid@!';
    }
  };

  // Step 0: Welcome
  const welcomeStep = {
    type: 'welcome',
    title: '¡Bienvenido a Wake Creadores!'
  };

  // Step 1: Profile Picture
  const profilePictureStep = {
    type: 'profilePicture',
    title: 'Sube tu foto de perfil',
    description: 'Esta foto aparecerá en tu perfil de creador'
  };

  const totalSteps = 4; // Welcome + Profile Picture + Card Creation + Completion

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfilePictureUpload = async () => {
    if (!profilePicture || !user) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      await profilePictureService.uploadProfilePicture(
        user.uid,
        profilePicture,
        (progress) => setUploadProgress(progress)
      );
      setCurrentStep(currentStep + 1);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert(error.message || 'Error al subir la foto de perfil. Por favor intenta de nuevo.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };


  const handleNext = async () => {
    if (currentStep === 0) {
      // Welcome step
      setCurrentStep(1);
    } else if (currentStep === 1) {
      // Profile picture step - handled separately
      if (profilePicture) {
        handleProfilePictureUpload();
      } else {
        alert('Por favor sube una foto de perfil para continuar');
      }
    } else if (currentStep === 2) {
      // Card creation step - validate, upload card, then proceed to completion
      if (cardTitle.trim().length === 0) {
        alert('Por favor ingresa un título para tu historia');
        return;
      }
      if (cardMedia === null) {
        alert('Por favor sube una imagen o video para tu historia');
        return;
      }
      
      // Upload card if media is provided
      if (cardMedia && user) {
        setIsCardUploading(true);
        setCardUploadProgress(0);
        
        try {
          const mediaURL = cardMediaType === 'video' 
            ? await cardService.uploadCardVideo(user.uid, cardMedia, (progress) => setCardUploadProgress(progress))
            : await cardService.uploadCardImage(user.uid, cardMedia, (progress) => setCardUploadProgress(progress));
          
          // Save card with media URL
          const cards = {
            [cardTitle.trim()]: mediaURL
          };
          await updateUser(user.uid, { cards });
        } catch (error) {
          console.error('Error uploading card media:', error);
          // Show the actual error message from the service
          const errorMessage = error.message || 'Error al subir la imagen/video. Por favor intenta de nuevo.';
          alert(errorMessage);
          setIsCardUploading(false);
          setCardUploadProgress(0);
          return;
        } finally {
          setIsCardUploading(false);
          setCardUploadProgress(0);
        }
      }
      
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Completion step - complete onboarding
      handleComplete();
    }
  };

  const handleCardMediaSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCardMedia(file);
      setCardMediaType(file.type.startsWith('video/') ? 'video' : 'image');
      const reader = new FileReader();
      reader.onloadend = () => {
        setCardMediaPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    
    setIsCompleting(true);
    try {
      // Complete onboarding (card is already saved in previous step)
      await completeWebOnboarding(user.uid, {
        completedAt: new Date().toISOString(),
      });
      await refreshUserData();
      navigate('/lab', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      alert('Error al completar el onboarding. Por favor intenta de nuevo.');
      setIsCompleting(false);
    }
  };

  const renderStep = () => {
    if (currentStep === 0) {
      // Welcome step
      return (
        <div className="onboarding-step-content">
          <div className="step-logo">
            <img 
              src={`${ASSET_BASE}wake-isotipo-negativo.png`} 
              alt="Wake Logo" 
              className="wake-logo-image"
              onError={(e) => {
                // Fallback to other logo if this one doesn't exist
                e.target.src = '/wake-isotipo.png';
              }}
            />
          </div>
          <h1 className="step-title">{welcomeStep.title}</h1>
        </div>
      );
    } else if (currentStep === 1) {
      // Profile picture step
      return (
        <div className="onboarding-step-content">
          <h1 className="step-title">{profilePictureStep.title}</h1>
          <p className="step-description">{profilePictureStep.description}</p>
          
          <div className="profile-picture-upload">
            <div 
              className={`profile-picture-preview ${profilePicturePreview ? 'has-image' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {profilePicturePreview ? (
                <img src={profilePicturePreview} alt="Preview" />
              ) : (
                <div className="upload-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>Haz clic para subir</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {isUploading && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p>{Math.round(uploadProgress)}%</p>
              </div>
            )}
          </div>
        </div>
      );
    } else if (currentStep === 2) {
      // Card creation step
      return (
        <div className="onboarding-step-content">
          <h1 className="step-title">Cuenta tu primera historia</h1>
          <p className="step-description">
            Comparte una imagen o video que cuente quién eres y de dónde vienes. Te recomendamos usar alguna de las que tengas en tu Instagram o TikTok.
          </p>
          
          <div className="card-creation-form">
            <Input
              placeholder="Título de tu historia"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              type="text"
            />
            
            <div className="card-media-option">
              <div 
                className={`card-media-preview ${cardMediaPreview ? 'has-media' : ''}`}
                onClick={() => cardMediaInputRef.current?.click()}
              >
                {cardMediaPreview ? (
                  cardMediaType === 'video' ? (
                    <video src={cardMediaPreview} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={cardMediaPreview} alt="Preview" />
                  )
                ) : (
                  <div className="upload-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>Sube una imagen o video</p>
                  </div>
                )}
              </div>
              <input
                ref={cardMediaInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleCardMediaSelect}
                style={{ display: 'none' }}
              />
              {isCardUploading && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${cardUploadProgress}%` }}
                    />
                  </div>
                  <p>{Math.round(cardUploadProgress)}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else if (currentStep === 3) {
      // Completion step
      return (
        <div className="onboarding-step-content">
          <div className="step-logo">
            <img 
              src={`${ASSET_BASE}wake-isotipo-negativo.png`} 
              alt="Wake Logo" 
              className="wake-logo-image"
              onError={(e) => {
                // Fallback to other logo if this one doesn't exist
                e.target.src = '/wake-isotipo.png';
              }}
            />
          </div>
          <h1 className="step-title">{getWelcomeMessage()}</h1>
        </div>
      );
    }
  };

  const canProceed = () => {
    if (currentStep === 0) return true;
    if (currentStep === 1) return profilePicture !== null && !isUploading;
    if (currentStep === 2) {
      // Card creation step - need title and media
      return cardTitle.trim().length > 0 && cardMedia !== null;
    }
    if (currentStep === 3) return true; // Completion step - always can proceed
    return true;
  };


  return (
    <div className="creator-onboarding-container">
      <div className="creator-onboarding-content">
        {/* Progress Indicator */}
        <div className="onboarding-progress">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`progress-dot ${index <= currentStep ? 'progress-dot-active' : ''}`}
            />
          ))}
        </div>

        {/* Step Content */}
        {renderStep()}

        {/* Navigation Buttons */}
        <div className="onboarding-actions">
          <Button
            title={
              currentStep === 3 ? 'Vamos al Lab' : 
              currentStep === 1 ? 'Subir y Continuar' : 
              currentStep === 2 ? 'Continuar' :
              'Continuar'
            }
            onClick={handleNext}
            loading={isCompleting || isUploading || isCardUploading}
            disabled={!canProceed() || isCompleting || isUploading || isCardUploading}
            active={canProceed()}
          />
        </div>
      </div>
    </div>
  );
};

export default CreatorOnboardingScreen;
