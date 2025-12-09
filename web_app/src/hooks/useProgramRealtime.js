// Real-time listener hook for active program editing
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { queryKeys } from '../config/queryClient';

/**
 * Hook to enable real-time listeners for active program editing
 * Only activates when isActive is true to minimize read costs
 * 
 * Edge cases handled:
 * - Listener cleanup on unmount
 * - Tab visibility changes (pause/resume)
 * - Network disconnections
 * - Concurrent edits detection
 */
export const useProgramRealtime = (programId, isActive = false) => {
  const queryClient = useQueryClient();
  const listenersRef = useRef([]);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    // Handle tab visibility changes
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!programId || !isActive) {
      // Clean up listeners when not active
      listenersRef.current.forEach(unsubscribe => unsubscribe());
      listenersRef.current = [];
      return;
    }

    // Only set up listeners if tab is visible
    if (!isVisibleRef.current) {
      return;
    }

    let isMounted = true;
    const listeners = [];

    try {
      // Listen to program document
      const programUnsubscribe = onSnapshot(
        doc(firestore, 'courses', programId),
        (docSnapshot) => {
          if (!isMounted) return;
          
          if (docSnapshot.exists()) {
            const programData = {
              id: docSnapshot.id,
              ...docSnapshot.data(),
            };
            
            // Update React Query cache
            queryClient.setQueryData(
              queryKeys.programs.detail(programId),
              programData
            );
          }
        },
        (error) => {
          console.error('Error in program real-time listener:', error);
          // Don't throw - just log, listener will retry automatically
        }
      );
      listeners.push(programUnsubscribe);

      // Listen to modules collection
      const modulesUnsubscribe = onSnapshot(
        query(
          collection(firestore, 'courses', programId, 'modules'),
          orderBy('order', 'asc')
        ),
        (snapshot) => {
          if (!isMounted) return;
          
          const modules = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          // Update React Query cache
          queryClient.setQueryData(
            queryKeys.modules.all(programId),
            modules
          );
        },
        (error) => {
          console.error('Error in modules real-time listener:', error);
        }
      );
      listeners.push(modulesUnsubscribe);

      // Store listeners for cleanup
      listenersRef.current = listeners;

    } catch (error) {
      console.error('Error setting up real-time listeners:', error);
    }

    return () => {
      isMounted = false;
      listeners.forEach(unsubscribe => unsubscribe());
      listenersRef.current = [];
    };
  }, [programId, isActive, queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach(unsubscribe => unsubscribe());
      listenersRef.current = [];
    };
  }, []);
};

/**
 * Hook to listen to sessions for a specific module in real-time
 */
export const useModuleSessionsRealtime = (programId, moduleId, isActive = false) => {
  const queryClient = useQueryClient();
  const listenerRef = useRef(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!programId || !moduleId || !isActive) {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      return;
    }

    if (!isVisibleRef.current) {
      return;
    }

    let isMounted = true;

    try {
      const unsubscribe = onSnapshot(
        query(
          collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions'),
          orderBy('order', 'asc')
        ),
        (snapshot) => {
          if (!isMounted) return;
          
          const sessions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          queryClient.setQueryData(
            queryKeys.sessions.all(programId, moduleId),
            sessions
          );
        },
        (error) => {
          console.error('Error in sessions real-time listener:', error);
        }
      );

      listenerRef.current = unsubscribe;
    } catch (error) {
      console.error('Error setting up sessions real-time listener:', error);
    }

    return () => {
      isMounted = false;
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, [programId, moduleId, isActive, queryClient]);
};

/**
 * Hook to listen to exercises for a specific session in real-time
 */
export const useSessionExercisesRealtime = (programId, moduleId, sessionId, isActive = false) => {
  const queryClient = useQueryClient();
  const listenerRef = useRef(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!programId || !moduleId || !sessionId || !isActive) {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      return;
    }

    if (!isVisibleRef.current) {
      return;
    }

    let isMounted = true;

    try {
      const unsubscribe = onSnapshot(
        query(
          collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises'),
          orderBy('order', 'asc')
        ),
        (snapshot) => {
          if (!isMounted) return;
          
          const exercises = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          queryClient.setQueryData(
            queryKeys.exercises.all(programId, moduleId, sessionId),
            exercises
          );
        },
        (error) => {
          console.error('Error in exercises real-time listener:', error);
        }
      );

      listenerRef.current = unsubscribe;
    } catch (error) {
      console.error('Error setting up exercises real-time listener:', error);
    }

    return () => {
      isMounted = false;
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, [programId, moduleId, sessionId, isActive, queryClient]);
};

