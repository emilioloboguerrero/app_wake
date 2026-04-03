import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import wakeDebug from '../utils/wakeDebug';

const ROUTE_NAMES = {
  '/': 'Main',
  '/login': 'Login',
  '/profile': 'Profile',
  '/nutrition': 'Nutrition',
  '/library': 'ProgramLibrary',
  '/progress': 'Lab',
  '/sessions': 'Sessions',
  '/prs': 'PRs',
  '/volume': 'WeeklyVolume',
  '/subscriptions': 'Subscriptions',
  '/courses': 'AllCourses',
  '/warmup': 'Warmup',
  '/onboarding': 'Onboarding',
  '/creator/events': 'EventsManagement',
};

function resolveScreenName(pathname) {
  if (ROUTE_NAMES[pathname]) return ROUTE_NAMES[pathname];
  if (pathname.startsWith('/course/') && pathname.endsWith('/workout/execution')) return 'WorkoutExecution';
  if (pathname.startsWith('/course/') && pathname.endsWith('/workout/completion')) return 'WorkoutCompletion';
  if (pathname.startsWith('/course/') && pathname.endsWith('/workout')) return 'DailyWorkout';
  if (pathname.startsWith('/course/') && pathname.endsWith('/structure')) return 'CourseStructure';
  if (pathname.startsWith('/course/')) return 'CourseDetail';
  if (pathname.startsWith('/creator/')) return 'Creator';
  if (pathname.startsWith('/sessions/')) return 'SessionDetail';
  if (pathname.startsWith('/prs/')) return 'PRDetail';
  if (pathname.startsWith('/call/')) return 'UpcomingCallDetail';
  if (pathname.startsWith('/onboarding')) return 'Onboarding';
  return pathname;
}

export default function DebugScreenTracker() {
  if (!wakeDebug.IS_ENABLED) return null;
  return <Tracker />;
}

function Tracker() {
  const location = useLocation();
  const prevPath = useRef(null);

  useEffect(() => {
    const path = location.pathname;
    if (path !== prevPath.current) {
      prevPath.current = path;
      const name = resolveScreenName(path);
      wakeDebug.setScreen(name);
    }
  }, [location.pathname]);

  return null;
}
