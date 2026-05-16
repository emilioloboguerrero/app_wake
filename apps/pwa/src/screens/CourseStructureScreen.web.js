// Web wrapper for CourseStructureScreen.
//
// For block_cadence: 'monthly_first_monday' courses we replace the legacy
// expandable module/session list with a calendar layout (one card per month,
// see docs/BRIEF_BLOCK_UX.md). Non-cadenced courses fall through to the
// shared React Native base — zero regression on low_ticket/general/one_on_one.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIMES } from '../config/queryConfig';
import LoadingScreen from './LoadingScreen';
import firestoreService from '../services/apiService';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentBlock } from '../hooks/hoy/useCurrentBlock';
import { useBlocksOverview } from '../hooks/hoy/useBlocksOverview';
import MonthlyBlockCalendar from '../components/program/MonthlyBlockCalendar.jsx';
import exerciseHistoryService from '../services/exerciseHistoryService';
// Import the base RN component for non-cadenced courses
const CourseStructureScreenModule = require('./CourseStructureScreen.js');
const CourseStructureScreenBase = CourseStructureScreenModule.default;

const headerWrap = {
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  padding: '32px 24px 0',
  boxSizing: 'border-box',
  color: '#fff',
};
const titleStyle = {
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: -0.4,
  margin: '0 0 28px',
  color: '#fff',
};
const screenStyle = {
  minHeight: '100vh',
  backgroundColor: '#1a1a1a',
};
const calendarWrap = {
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  padding: '0 24px 48px',
  boxSizing: 'border-box',
};
const backBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.65)',
  fontSize: 13,
  letterSpacing: 0.4,
  padding: '8px 0',
  marginBottom: 12,
  cursor: 'pointer',
};

const CourseStructureScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const courseFromState = location.state?.course;

  const { data: course, isLoading: loading } = useQuery({
    queryKey: ['programs', courseId],
    queryFn: async () => {
      if (courseFromState) {
        return {
          ...courseFromState,
          courseId: courseFromState.courseId || courseFromState.id || courseId,
          id: courseFromState.id || courseFromState.courseId || courseId,
        };
      }
      const courseData = await firestoreService.getCourse(courseId);
      if (!courseData) return null;
      return {
        ...courseData,
        id: courseData.id || courseId,
        courseId: courseData.id || courseId,
        title: courseData.title || 'Programa sin título',
      };
    },
    enabled: !!courseId || !!courseFromState,
    staleTime: STALE_TIMES.programStructure,
  });

  // Pull the live cadence flag from the API course doc (state-passed course
  // may be a stale snapshot from users.courses which doesn't carry it).
  const { data: liveCourse } = useQuery({
    queryKey: ['preview', 'courseDetail', courseId],
    queryFn: () => apiClient.get(`/workout/courses/${courseId}`).then((r) => r?.data ?? null),
    enabled: !!courseId && !!user?.uid,
    staleTime: 10 * 60 * 1000,
  });

  const cadence = liveCourse?.block_cadence || course?.block_cadence || null;
  const isMonthlyDrop = cadence === 'monthly_first_monday';

  const { block } = useCurrentBlock(courseId, { enabled: !!courseId && isMonthlyDrop });
  const { blocks } = useBlocksOverview(courseId, { enabled: !!courseId && isMonthlyDrop });

  const [completedSessions, setCompletedSessions] = useState([]);
  useEffect(() => {
    if (!isMonthlyDrop || !user?.uid || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/workout/sessions', { params: { courseId, limit: 80 } });
        const page = res?.data ?? [];
        if (!cancelled) {
          setCompletedSessions(
            page.map((s) => ({
              sessionId: s.sessionId,
              completedAt: s.completedAt || s.date,
            }))
          );
        }
      } catch {
        // best-effort; calendar still renders empty dots
        if (!cancelled) setCompletedSessions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isMonthlyDrop, user?.uid, courseId]);

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!isMonthlyDrop) return;
    const t = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t);
  }, [isMonthlyDrop, blocks?.length]);

  const onPressSession = useMemo(() => (session) => {
    if (!session) return;
    const cId = course?.courseId || course?.id || courseId;
    navigate(`/course/${cId}/workout`, {
      state: {
        course: {
          ...(course || {}),
          courseId: cId,
          id: cId,
        },
        selectedSessionId: session.id || session.sessionId,
        selectedModuleId: block?.moduleId,
        // selectedSessionIndex is computed by DailyWorkout from sessionId order.
      },
    });
  }, [course, courseId, navigate, block?.moduleId]);

  // Adapter for the non-cadenced fallback
  const navigation = useMemo(() => ({
    navigate: (routeName, params) => {
      const routeMap = {
        DailyWorkout: () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout`, { state: params });
        },
        CourseDetail: () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}`, { state: params });
        },
        Main: () => navigate('/'),
        MainScreen: () => navigate('/'),
      };
      if (routeMap[routeName]) routeMap[routeName]();
      else navigate(`/${routeName.toLowerCase()}`, { state: params });
    },
    goBack: () => navigate(-1),
    setParams: () => {},
  }), [navigate, courseId]);

  const route = useMemo(() => ({
    params: {
      course,
      ...(location.state || {}),
    },
  }), [course, location.state]);

  if (loading || authLoading || !user) {
    return <LoadingScreen />;
  }

  if (!course) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
      }}>
        <p>Programa no encontrado</p>
      </div>
    );
  }

  if (!isMonthlyDrop) {
    return <CourseStructureScreenBase navigation={navigation} route={route} />;
  }

  return (
    <div style={screenStyle}>
      <div style={headerWrap}>
        <button type="button" style={backBtn} onClick={() => navigate(-1)} aria-label="Atrás">‹ Atrás</button>
        <h1 style={titleStyle}>{course.title}</h1>
      </div>
      <div style={calendarWrap}>
        <MonthlyBlockCalendar
          blocks={blocks}
          currentBlock={block}
          completedSessions={completedSessions}
          onPressSession={onPressSession}
          entered={entered}
        />
      </div>
    </div>
  );
};

export default CourseStructureScreen;
