import React, { createContext, useContext, useState } from 'react';

const VideoContext = createContext();

export const useVideo = () => {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error('useVideo must be used within a VideoProvider');
  }
  return context;
};

export const VideoProvider = ({ children }) => {
  const [isMuted, setIsMuted] = useState(false); // false = sound on, true = muted

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const setMuted = (muted) => {
    setIsMuted(muted);
  };

  const value = {
    isMuted,
    toggleMute,
    setMuted,
  };

  return (
    <VideoContext.Provider value={value}>
      {children}
    </VideoContext.Provider>
  );
};
