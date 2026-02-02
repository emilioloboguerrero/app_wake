import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

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

  // Memoize callbacks to prevent re-creation on every render
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const setMuted = useCallback((muted) => {
    setIsMuted(muted);
  }, []);

  // Memoize value object to prevent unnecessary re-renders
  const value = useMemo(() => ({
    isMuted,
    toggleMute,
    setMuted,
  }), [isMuted, toggleMute, setMuted]);

  return (
    <VideoContext.Provider value={value}>
      {children}
    </VideoContext.Provider>
  );
};
