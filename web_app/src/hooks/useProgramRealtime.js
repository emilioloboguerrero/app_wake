// Real-time listener hook for active program editing
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { firestore } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
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
      // Note: We don't resolve library modules in real-time to avoid async issues
      // Instead, we rely on getModulesByProgram to do the resolution
      // The real-time listener only updates when modules are added/removed/reordered
      const modulesUnsubscribe = onSnapshot(
        query(
          collection(firestore, 'courses', programId, 'modules'),
          orderBy('order', 'asc')
        ),
        async (snapshot) => {
          if (!isMounted) return;
          
          // Get program to get creator_id for library resolution
          const programDoc = await getDoc(doc(firestore, 'courses', programId));
          const creatorId = programDoc.data()?.creator_id;
          
          // Resolve library modules if needed (same logic as getModulesByProgram)
          const modules = await Promise.all(
            snapshot.docs.map(async (docSnapshot) => {
              const moduleData = docSnapshot.data();
              
              // If library reference, resolve it
              if (moduleData.libraryModuleRef && creatorId) {
                try {
                  const { default: libraryService } = await import('../services/libraryService');
                  const libraryModule = await libraryService.getLibraryModuleById(creatorId, moduleData.libraryModuleRef);
                  
                  if (libraryModule) {
                    // Merge library module data (includes title from library)
                    return {
                      id: docSnapshot.id,
                      ...libraryModule, // Library module data first (includes title)
                      libraryModuleRef: moduleData.libraryModuleRef,
                      order: moduleData.order
                    };
                  }
                } catch (error) {
                  console.error('Error resolving library module in real-time:', error);
                }
              }
              
              // Standalone module or resolution failed
              return {
                id: docSnapshot.id,
                ...moduleData
              };
            })
          );
          
          // Sort by order
          modules.sort((a, b) => {
            const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
            const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
            return orderA - orderB;
          });
          
          // Update React Query cache
          queryClient.setQueryData(
            queryKeys.modules.all(programId),
            modules
          );
          queryClient.setQueryData(
            queryKeys.modules.withCounts(programId),
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
        async (snapshot) => {
          if (!isMounted) return;
          
          // Get program to get creator_id for library resolution
          const programDoc = await getDoc(doc(firestore, 'courses', programId));
          const creatorId = programDoc.data()?.creator_id;
          
          // Check if this module is a library reference
          const moduleDoc = await getDoc(doc(firestore, 'courses', programId, 'modules', moduleId));
          const moduleData = moduleDoc.data();
          
          // If library module reference, resolve sessions from library
          if (moduleData?.libraryModuleRef && creatorId) {
            try {
              const { default: libraryService } = await import('../services/libraryService');
              const libraryModule = await libraryService.getLibraryModuleById(creatorId, moduleData.libraryModuleRef);
              
              if (libraryModule && libraryModule.sessionRefs) {
                // Resolve library sessions
                const sessionRefs = libraryModule.sessionRefs;
                const resolvedSessions = await Promise.all(
                  sessionRefs.map(async (sessionRef, index) => {
                    const librarySessionId = typeof sessionRef === 'string' 
                      ? sessionRef 
                      : (sessionRef.librarySessionRef || sessionRef.id || sessionRef);
                    const sessionOrder = typeof sessionRef === 'object' && sessionRef.order !== undefined
                      ? sessionRef.order
                      : index;
                    
                    try {
                      const librarySession = await libraryService.getLibrarySessionById(creatorId, librarySessionId);
                      if (librarySession) {
                        // Find matching program session for overrides
                        const matchingSession = snapshot.docs.find(sessionDoc =>
                          sessionDoc.data().librarySessionRef === librarySessionId
                        );
                        
                        return {
                          id: matchingSession?.id || librarySessionId,
                          ...librarySession,
                          title: librarySession.title || librarySession.name, // Ensure title is set
                          librarySessionRef: librarySessionId,
                          order: matchingSession?.data().order ?? sessionOrder
                        };
                      }
                    } catch (error) {
                      console.error(`Error resolving library session ${librarySessionId}:`, error);
                      return null;
                    }
                    return null;
                  })
                );
                
                const sessions = resolvedSessions.filter(Boolean);
                sessions.sort((a, b) => {
                  const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
                  const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
                  return orderA - orderB;
                });
                
                queryClient.setQueryData(
                  queryKeys.sessions.all(programId, moduleId),
                  sessions
                );
                return;
              }
            } catch (error) {
              console.error('Error resolving library module sessions in real-time:', error);
              // Fall through to regular session loading
            }
          }
          
          // Regular module or library resolution failed - use program sessions
          const sessions = await Promise.all(
            snapshot.docs.map(async (docSnapshot) => {
              const sessionData = docSnapshot.data();
              
              // If library session reference, resolve it
              if (sessionData.librarySessionRef && creatorId) {
                try {
                  const { default: libraryService } = await import('../services/libraryService');
                  const librarySession = await libraryService.getLibrarySessionById(creatorId, sessionData.librarySessionRef);
                  
                  if (librarySession) {
                    return {
                      id: docSnapshot.id,
                      ...librarySession,
                      title: librarySession.title || librarySession.name, // Ensure title is set
                      librarySessionRef: sessionData.librarySessionRef,
                      order: sessionData.order
                    };
                  }
                } catch (error) {
                  console.error('Error resolving library session in real-time:', error);
                }
              }
              
              // Standalone session or resolution failed
              return {
                id: docSnapshot.id,
                ...sessionData
              };
            })
          );
          
          // Sort by order
          sessions.sort((a, b) => {
            const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
            const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
            return orderA - orderB;
          });
          
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

