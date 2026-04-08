import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { MISSIONS, STORAGE_KEY_CELEBRATED, STORAGE_KEY_DISMISSED } from '../config/missions';
import apiClient from '../utils/apiClient';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import eventService from '../services/eventService';
import oneOnOneService from '../services/oneOnOneService';

// Reads celebrated mission IDs from localStorage
const getCelebrated = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CELEBRATED) || '[]'); }
  catch { return []; }
};

const setCelebrated = (ids) => {
  localStorage.setItem(STORAGE_KEY_CELEBRATED, JSON.stringify(ids));
};

export const isDismissed = () => localStorage.getItem(STORAGE_KEY_DISMISSED) === '1';
export const dismissMissions = () => localStorage.setItem(STORAGE_KEY_DISMISSED, '1');
export const restoreMissions = () => localStorage.removeItem(STORAGE_KEY_DISMISSED);

export default function useMissions() {
  const { user } = useAuth();
  const uid = user?.uid;

  // Reuse the same queries the app already makes — if screens have fetched this
  // data, it comes from cache at zero cost. If not, these are lightweight list calls.
  // Mission data changes infrequently — long staleTime + no refetch on mount
  // prevents duplicate queries when navigating between screens.
  const missionCacheOverrides = { staleTime: 30 * 60 * 1000, refetchOnMount: false };

  const { data: profile } = useQuery({
    queryKey: queryKeys.user.detail(uid),
    queryFn: () => apiClient.get('/users/me').then((r) => r.data),
    enabled: !!uid,
    ...cacheConfig.userProfile,
    ...missionCacheOverrides,
  });

  const { data: librarySessions } = useQuery({
    queryKey: queryKeys.library.sessions(uid),
    queryFn: () => libraryService.getSessionLibraryWithExercises(),
    enabled: !!uid,
    ...cacheConfig.librarySessions,
    ...missionCacheOverrides,
  });

  const { data: programs } = useQuery({
    queryKey: queryKeys.programs.byCreator(uid),
    queryFn: () => programService.getProgramsByCreator(),
    enabled: !!uid,
    ...cacheConfig.otherPrograms,
    ...missionCacheOverrides,
  });

  const { data: clients } = useQuery({
    queryKey: queryKeys.clients.byCreator(uid),
    queryFn: () => oneOnOneService.getClientsByCreator(),
    enabled: !!uid,
    ...cacheConfig.clientsOverview,
    ...missionCacheOverrides,
  });

  const { data: events } = useQuery({
    queryKey: queryKeys.events.byCreator(uid),
    queryFn: () => eventService.getEventsByCreator(),
    enabled: !!uid,
    ...cacheConfig.events,
    ...missionCacheOverrides,
  });

  // Aggregate all data for mission detection
  const missionData = useMemo(() => ({
    profile: {
      profilePicture: profile?.profilePictureUrl,
      username: profile?.username,
    },
    librarySessions: librarySessions || [],
    programs: programs || [],
    clients: clients || [],
    events: events || [],
  }), [profile, librarySessions, programs, clients, events]);

  // Evaluate each mission
  const missions = useMemo(() => {
    const celebrated = getCelebrated();
    return MISSIONS.map((m) => ({
      ...m,
      completed: m.detect(missionData),
      celebrated: celebrated.includes(m.id),
    }));
  }, [missionData]);

  const completedCount = missions.filter((m) => m.completed).length;
  const totalCount = missions.length;
  const allComplete = completedCount === totalCount;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  // Mark a mission as celebrated (animation already shown)
  const celebrate = (missionId) => {
    const next = [...new Set([...getCelebrated(), missionId])];
    setCelebrated(next);
  };

  return {
    missions,
    completedCount,
    totalCount,
    allComplete,
    progress,
    celebrate,
  };
}
