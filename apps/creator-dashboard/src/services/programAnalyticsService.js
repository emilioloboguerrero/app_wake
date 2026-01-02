// Program Analytics Service - Efficiently aggregates program statistics
import { firestore } from '../config/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where,
  doc,
  getDoc,
  collectionGroup
} from 'firebase/firestore';

class ProgramAnalyticsService {
  /**
   * Get comprehensive analytics for a program
   * This is optimized to minimize Firestore reads by batching queries
   */
  async getProgramAnalytics(programId) {
    try {
      console.log('📊 Fetching analytics for program:', programId);
      
      // Get program structure first (modules, sessions, exercises)
      const programStructure = await this.getProgramStructure(programId);
      
      // Get enrolled users first (needed for other queries)
      const enrolledUsers = await this.getEnrolledUsers(programId);
      
      // Then get session and exercise history in parallel
      const [allSessionHistory, allExerciseHistory] = await Promise.all([
        this.getAllSessionHistoryForProgram(programId, enrolledUsers),
        this.getAllExerciseHistoryForProgram(programId, enrolledUsers)
      ]);
      
      // Calculate all statistics
      const analytics = {
        // Enrollment metrics
        enrollment: this.calculateEnrollmentMetrics(enrolledUsers),
        
        // Engagement metrics
        engagement: this.calculateEngagementMetrics(enrolledUsers),
        
        // Session performance
        sessions: this.calculateSessionMetrics(allSessionHistory, programStructure),
        
        // Exercise analytics
        exercises: this.calculateExerciseMetrics(allExerciseHistory),
        
        // Program structure
        structure: programStructure,
        
        // User progression
        progression: this.calculateProgressionMetrics(enrolledUsers)
      };
      
      console.log('✅ Analytics calculated:', analytics);
      return analytics;
      
    } catch (error) {
      console.error('❌ Error fetching program analytics:', error);
      throw error;
    }
  }
  
  /**
   * Get program structure (modules, sessions, exercises)
   */
  async getProgramStructure(programId) {
    try {
      const modulesRef = collection(firestore, 'courses', programId, 'modules');
      const modulesSnapshot = await getDocs(modulesRef);
      
      let totalSessions = 0;
      let totalExercises = 0;
      const modules = [];
      
      for (const moduleDoc of modulesSnapshot.docs) {
        const moduleId = moduleDoc.id;
        const sessionsRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions');
        const sessionsSnapshot = await getDocs(sessionsRef);
        
        let moduleExercises = 0;
        const sessions = [];
        
        for (const sessionDoc of sessionsSnapshot.docs) {
          const sessionId = sessionDoc.id;
          const exercisesRef = collection(firestore, 'courses', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises');
          const exercisesSnapshot = await getDocs(exercisesRef);
          
          moduleExercises += exercisesSnapshot.size;
          sessions.push({
            id: sessionId,
            title: sessionDoc.data().title || 'Sin título'
          });
        }
        
        totalSessions += sessions.length;
        totalExercises += moduleExercises;
        
        modules.push({
          id: moduleId,
          title: moduleDoc.data().title || 'Sin título',
          sessions: sessions.length,
          exercises: moduleExercises
        });
      }
      
      return {
        totalModules: modules.length,
        totalSessions,
        totalExercises,
        averageExercisesPerSession: totalSessions > 0 ? (totalExercises / totalSessions).toFixed(1) : 0,
        modules
      };
    } catch (error) {
      console.error('❌ Error getting program structure:', error);
      return {
        totalModules: 0,
        totalSessions: 0,
        totalExercises: 0,
        averageExercisesPerSession: 0,
        modules: []
      };
    }
  }
  
  /**
   * Get all users enrolled in the program
   * This queries purchases collection first, then users collection
   */
  async getEnrolledUsers(programId) {
    try {
      const userIds = new Set();
      
      // First, try to get user IDs from purchases collection
      try {
        const purchasesRef = collection(firestore, 'purchases');
        const purchasesQuery = query(purchasesRef, where('course_id', '==', programId));
        const purchasesSnapshot = await getDocs(purchasesQuery);
        
        purchasesSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.user_id) {
            userIds.add(data.user_id);
          }
        });
      } catch (error) {
        console.warn('⚠️ Could not query purchases collection:', error);
      }
      
      // Also check users collection for course enrollment
      // This is a fallback if purchases collection doesn't have all data
      try {
        const usersRef = collection(firestore, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        usersSnapshot.forEach(userDoc => {
          const userData = userDoc.data();
          if (userData.courses && userData.courses[programId]) {
            userIds.add(userDoc.id);
          }
        });
      } catch (error) {
        console.warn('⚠️ Could not query users collection:', error);
      }
      
      if (userIds.size === 0) {
        return [];
      }
      
      // Batch read user documents for enrolled users
      const userPromises = Array.from(userIds).map(userId => 
        getDoc(doc(firestore, 'users', userId)).then(userDoc => {
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const courseData = userData.courses?.[programId];
            const courseProgress = userData.courseProgress?.[programId];
            
            if (courseData) {
              // Calculate age from birthDate if available
              let calculatedAge = null;
              if (userData.birthDate) {
                const birthDate = new Date(userData.birthDate);
                if (!isNaN(birthDate.getTime())) {
                  calculatedAge = new Date().getFullYear() - birthDate.getFullYear();
                  const monthDiff = new Date().getMonth() - birthDate.getMonth();
                  if (monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < birthDate.getDate())) {
                    calculatedAge--;
                  }
                }
              }
              
              return {
                userId,
                userName: userData.name || userData.displayName || userData.email || userId.slice(0, 8) + '...',
                userEmail: userData.email || null,
                userCity: userData.city || userData.location || null,
                userAge: userData.age || calculatedAge,
                userGender: userData.gender || null,
                onboardingData: userData.onboarding || userData.onboardingData || null, // Store all onboarding data
                courseData,
                courseProgress: courseProgress || null
              };
            }
          }
          return null;
        }).catch(error => {
          console.error(`❌ Error reading user ${userId}:`, error);
          return null;
        })
      );
      
      const results = await Promise.all(userPromises);
      return results.filter(user => user !== null);
      
    } catch (error) {
      console.error('❌ Error getting enrolled users:', error);
      return [];
    }
  }
  
  /**
   * Get all session history for the program across all users
   * Uses collection group query if possible, otherwise queries per user
   */
  async getAllSessionHistoryForProgram(programId, enrolledUsers = null) {
    try {
      // Use provided enrolledUsers or fetch them
      if (!enrolledUsers) {
        enrolledUsers = await this.getEnrolledUsers(programId);
      }
      
      const allSessions = [];
      
      // Batch query session history for all enrolled users
      const sessionPromises = enrolledUsers.map(async (user) => {
        try {
          const sessionHistoryRef = collection(firestore, 'users', user.userId, 'sessionHistory');
          const sessionSnapshot = await getDocs(sessionHistoryRef);
          
          const userSessions = [];
          sessionSnapshot.forEach(doc => {
            const sessionData = doc.data();
            if (sessionData.courseId === programId) {
              userSessions.push({
                ...sessionData,
                userId: user.userId,
                sessionId: doc.id
              });
            }
          });
          
          return userSessions;
        } catch (error) {
          console.error(`❌ Error getting session history for user ${user.userId}:`, error);
          return [];
        }
      });
      
      const results = await Promise.all(sessionPromises);
      return results.flat();
      
    } catch (error) {
      console.error('❌ Error getting all session history:', error);
      return [];
    }
  }
  
  /**
   * Get all exercise history for the program across all users
   */
  async getAllExerciseHistoryForProgram(programId, enrolledUsers = null) {
    try {
      // Use provided enrolledUsers or fetch them
      if (!enrolledUsers) {
        enrolledUsers = await this.getEnrolledUsers(programId);
      }
      
      const allExercises = {};
      
      // Batch query exercise history for all enrolled users
      const exercisePromises = enrolledUsers.map(async (user) => {
        try {
          const exerciseHistoryRef = collection(firestore, 'users', user.userId, 'exerciseHistory');
          const exerciseSnapshot = await getDocs(exerciseHistoryRef);
          
          exerciseSnapshot.forEach(doc => {
            const exerciseData = doc.data();
            if (!allExercises[doc.id]) {
              allExercises[doc.id] = {
                exerciseKey: doc.id,
                totalSessions: 0,
                totalSets: 0,
                users: new Set()
              };
            }
            
            allExercises[doc.id].totalSessions += exerciseData.sessions?.length || 0;
            allExercises[doc.id].totalSets += exerciseData.sessions?.reduce((sum, session) => {
              return sum + (session.sets?.length || 0);
            }, 0);
            allExercises[doc.id].users.add(user.userId);
          });
        } catch (error) {
          console.error(`❌ Error getting exercise history for user ${user.userId}:`, error);
        }
      });
      
      await Promise.all(exercisePromises);
      
      // Convert Sets to counts
      Object.keys(allExercises).forEach(key => {
        allExercises[key].users = allExercises[key].users.size;
      });
      
      return allExercises;
      
    } catch (error) {
      console.error('❌ Error getting all exercise history:', error);
      return {};
    }
  }
  
  /**
   * Calculate enrollment metrics
   */
  calculateEnrollmentMetrics(enrolledUsers) {
    const now = new Date();
    
    const active = enrolledUsers.filter(user => {
      const courseData = user.courseData;
      const isActive = courseData.status === 'active';
      const expiresAt = courseData.expires_at ? new Date(courseData.expires_at) : null;
      const isNotExpired = !expiresAt || expiresAt > now;
      return isActive && isNotExpired;
    });
    
    const trials = enrolledUsers.filter(user => user.courseData.is_trial === true);
    
    const expired = enrolledUsers.filter(user => {
      const courseData = user.courseData;
      const expiresAt = courseData.expires_at ? new Date(courseData.expires_at) : null;
      return expiresAt && expiresAt <= now && courseData.status !== 'cancelled';
    });
    
    const cancelled = enrolledUsers.filter(user => user.courseData.status === 'cancelled');
    
    // Calculate enrollment over time (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentEnrollments = enrolledUsers.filter(user => {
      const purchasedAt = user.courseData.purchased_at ? new Date(user.courseData.purchased_at) : null;
      return purchasedAt && purchasedAt >= thirtyDaysAgo;
    });
    
    // Calculate enrollment for previous 30 days (days 31-60)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const previousEnrollments = enrolledUsers.filter(user => {
      const purchasedAt = user.courseData.purchased_at ? new Date(user.courseData.purchased_at) : null;
      return purchasedAt && purchasedAt >= sixtyDaysAgo && purchasedAt < thirtyDaysAgo;
    });
    
    // Calculate percentage change
    const previousCount = previousEnrollments.length;
    const currentCount = recentEnrollments.length;
    let percentageChange = null;
    if (previousCount > 0) {
      percentageChange = ((currentCount - previousCount) / previousCount) * 100;
    } else if (currentCount > 0) {
      percentageChange = 100; // Infinite growth (from 0 to positive)
    }
    
    // Calculate average enrollment duration
    let totalDuration = 0;
    let durationCount = 0;
    enrolledUsers.forEach(user => {
      const purchasedAt = user.courseData.purchased_at ? new Date(user.courseData.purchased_at) : null;
      const expiresAt = user.courseData.expires_at ? new Date(user.courseData.expires_at) : null;
      
      if (purchasedAt && expiresAt) {
        const duration = expiresAt - purchasedAt;
        totalDuration += duration;
        durationCount++;
      }
    });
    
    const averageDurationDays = durationCount > 0 
      ? Math.round((totalDuration / durationCount) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Calculate demographic data
    const demographics = this.calculateDemographics(enrolledUsers);
    
    // Calculate most common customer profile
    const mostCommonCustomer = this.calculateMostCommonCustomer(enrolledUsers);
    
    // Calculate enrollments and free trials over time (last 30 days)
    const enrollmentsOverTime = this.calculateEnrollmentsOverTime(enrolledUsers, now);
    
    return {
      totalEnrolled: enrolledUsers.length,
      activeEnrollments: active.length,
      trialUsers: trials.length,
      expiredEnrollments: expired.length,
      cancelledEnrollments: cancelled.length,
      recentEnrollments30Days: recentEnrollments.length,
      previousEnrollments30Days: previousEnrollments.length,
      recentEnrollmentsPercentageChange: percentageChange,
      averageEnrollmentDurationDays: averageDurationDays,
      demographics,
      mostCommonCustomer,
      enrollmentsOverTime
    };
  }
  
  /**
   * Calculate enrollments and free trials over time (last 30 days)
   */
  calculateEnrollmentsOverTime(enrolledUsers, now) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Initialize all dates in the last 30 days
    const enrollmentsByDate = {};
    const trialsByDate = {};
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      enrollmentsByDate[dateStr] = 0;
      trialsByDate[dateStr] = 0;
    }
    
    // Count enrollments and trials by date
    enrolledUsers.forEach(user => {
      const purchasedAt = user.courseData.purchased_at ? new Date(user.courseData.purchased_at) : null;
      if (purchasedAt && purchasedAt >= thirtyDaysAgo) {
        const dateStr = purchasedAt.toISOString().split('T')[0];
        if (enrollmentsByDate.hasOwnProperty(dateStr)) {
          enrollmentsByDate[dateStr]++;
          if (user.courseData.is_trial === true) {
            trialsByDate[dateStr]++;
          }
        }
      }
    });
    
    // Convert to array format
    return Object.keys(enrollmentsByDate)
      .sort()
      .map(date => ({
        date,
        enrollments: enrollmentsByDate[date],
        trials: trialsByDate[date]
      }));
  }
  
  /**
   * Calculate demographic breakdown
   */
  calculateDemographics(enrolledUsers) {
    const ages = [];
    const genders = {};
    const cities = {};
    const onboardingAnswers = {}; // Store all onboarding question answers
    
    enrolledUsers.forEach(user => {
      // Age
      if (user.userAge) {
        ages.push(user.userAge);
      }
      
      // Gender
      if (user.userGender) {
        const gender = user.userGender.toLowerCase();
        genders[gender] = (genders[gender] || 0) + 1;
      }
      
      // City
      if (user.userCity) {
        cities[user.userCity] = (cities[user.userCity] || 0) + 1;
      }
      
      // Onboarding answers
      if (user.onboardingData && typeof user.onboardingData === 'object') {
        Object.entries(user.onboardingData).forEach(([key, value]) => {
          if (!onboardingAnswers[key]) {
            onboardingAnswers[key] = {};
          }
          const answerKey = String(value || 'N/A');
          onboardingAnswers[key][answerKey] = (onboardingAnswers[key][answerKey] || 0) + 1;
        });
      }
    });
    
    // Calculate age statistics
    const validAges = ages.filter(age => age > 0 && age < 120);
    const averageAge = validAges.length > 0 
      ? Math.round(validAges.reduce((sum, age) => sum + age, 0) / validAges.length)
      : null;
    const minAge = validAges.length > 0 ? Math.min(...validAges) : null;
    const maxAge = validAges.length > 0 ? Math.max(...validAges) : null;
    
    // Get top cities
    const topCities = Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));
    
    return {
      age: {
        average: averageAge,
        min: minAge,
        max: maxAge,
        distribution: this.createAgeDistribution(validAges)
      },
      gender: genders,
      topCities,
      onboardingAnswers
    };
  }
  
  /**
   * Get age bucket for a given age
   */
  getAgeBucket(age) {
    if (age >= 18 && age <= 24) return '18-24';
    if (age >= 25 && age <= 34) return '25-34';
    if (age >= 35 && age <= 44) return '35-44';
    if (age >= 45 && age <= 54) return '45-54';
    if (age >= 55 && age <= 64) return '55-64';
    if (age >= 65) return '65+';
    return null;
  }
  
  /**
   * Create age distribution buckets
   */
  createAgeDistribution(ages) {
    const buckets = {
      '18-24': 0,
      '25-34': 0,
      '35-44': 0,
      '45-54': 0,
      '55-64': 0,
      '65+': 0
    };
    
    ages.forEach(age => {
      if (age >= 18 && age <= 24) buckets['18-24']++;
      else if (age >= 25 && age <= 34) buckets['25-34']++;
      else if (age >= 35 && age <= 44) buckets['35-44']++;
      else if (age >= 45 && age <= 54) buckets['45-54']++;
      else if (age >= 55 && age <= 64) buckets['55-64']++;
      else if (age >= 65) buckets['65+']++;
    });
    
    return buckets;
  }
  
  /**
   * Calculate most common customer profile
   */
  calculateMostCommonCustomer(enrolledUsers) {
    const validUsers = enrolledUsers.filter(user => user.userAge || user.userGender || user.userCity || user.onboardingData);
    
    if (validUsers.length === 0) {
      return null;
    }
    
    // Calculate most common age (mode or average)
    const ages = validUsers.map(u => u.userAge).filter(a => a && a > 0 && a < 120);
    const mostCommonAge = ages.length > 0 
      ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
      : null;
    
    // Calculate most common gender
    const genderCounts = {};
    validUsers.forEach(user => {
      if (user.userGender) {
        const gender = user.userGender.toLowerCase();
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
      }
    });
    const mostCommonGender = Object.keys(genderCounts).length > 0
      ? Object.entries(genderCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    // Calculate most common city
    const cityCounts = {};
    validUsers.forEach(user => {
      if (user.userCity) {
        cityCounts[user.userCity] = (cityCounts[user.userCity] || 0) + 1;
      }
    });
    const mostCommonCity = Object.keys(cityCounts).length > 0
      ? Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    // Calculate most common onboarding answers
    const onboardingAnswers = {};
    validUsers.forEach(user => {
      if (user.onboardingData && typeof user.onboardingData === 'object') {
        Object.entries(user.onboardingData).forEach(([key, value]) => {
          if (!onboardingAnswers[key]) {
            onboardingAnswers[key] = {};
          }
          const answerKey = String(value || 'N/A');
          onboardingAnswers[key][answerKey] = (onboardingAnswers[key][answerKey] || 0) + 1;
        });
      }
    });
    
    const mostCommonOnboarding = {};
    Object.entries(onboardingAnswers).forEach(([question, answers]) => {
      const mostCommon = Object.entries(answers).sort((a, b) => b[1] - a[1])[0];
      if (mostCommon) {
        mostCommonOnboarding[question] = mostCommon[0];
      }
    });
    
    return {
      age: mostCommonAge,
      gender: mostCommonGender,
      city: mostCommonCity,
      onboardingAnswers: mostCommonOnboarding,
      sampleSize: validUsers.length
    };
  }
  
  /**
   * Calculate engagement metrics
   */
  calculateEngagementMetrics(enrolledUsers) {
    const usersWithProgress = enrolledUsers.filter(user => user.courseProgress);
    
    const totalSessionsCompleted = usersWithProgress.reduce((sum, user) => {
      return sum + (user.courseProgress.totalSessionsCompleted || 0);
    }, 0);
    
    const averageSessionsPerUser = enrolledUsers.length > 0
      ? (totalSessionsCompleted / enrolledUsers.length).toFixed(1)
      : 0;
    
    const usersWithAtLeastOneSession = usersWithProgress.filter(user => {
      return (user.courseProgress.totalSessionsCompleted || 0) > 0;
    }).length;
    
    const completionRate = enrolledUsers.length > 0
      ? ((usersWithAtLeastOneSession / enrolledUsers.length) * 100).toFixed(1)
      : 0;
    
    // Top 10 most active users
    const topUsers = usersWithProgress
      .map(user => ({
        userId: user.userId,
        userName: user.userName || user.userId.slice(0, 8) + '...',
        userEmail: user.userEmail || null,
        userCity: user.userCity || null,
        userAge: user.userAge || null,
        sessionsCompleted: user.courseProgress.totalSessionsCompleted || 0
      }))
      .sort((a, b) => b.sessionsCompleted - a.sessionsCompleted)
      .slice(0, 10);
    
    return {
      totalSessionsCompleted,
      averageSessionsPerUser: parseFloat(averageSessionsPerUser),
      completionRate: parseFloat(completionRate),
      usersWithAtLeastOneSession,
      topActiveUsers: topUsers
    };
  }
  
  /**
   * Calculate session performance metrics
   */
  calculateSessionMetrics(allSessionHistory, programStructure) {
    if (allSessionHistory.length === 0) {
      return {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedSession: null,
        leastCompletedSession: null,
        sessionsCompletedOverTime: []
      };
    }
    
    // Count completions per session
    const sessionCounts = {};
    let totalDuration = 0;
    let durationCount = 0;
    
    allSessionHistory.forEach(session => {
      const sessionId = session.sessionId;
      if (!sessionCounts[sessionId]) {
        sessionCounts[sessionId] = {
          sessionId,
          sessionName: session.sessionName || 'Unknown',
          count: 0
        };
      }
      sessionCounts[sessionId].count++;
      
      if (session.duration) {
        totalDuration += session.duration;
        durationCount++;
      }
    });
    
    const sessions = Object.values(sessionCounts);
    const mostCompleted = sessions.length > 0 
      ? sessions.reduce((max, s) => s.count > max.count ? s : max, sessions[0])
      : null;
    
    const leastCompleted = sessions.length > 0
      ? sessions.reduce((min, s) => s.count < min.count ? s : min, sessions[0])
      : null;
    
    // Group by date for timeline
    const sessionsByDate = {};
    allSessionHistory.forEach(session => {
      if (session.completedAt) {
        const date = new Date(session.completedAt).toISOString().split('T')[0];
        sessionsByDate[date] = (sessionsByDate[date] || 0) + 1;
      }
    });
    
    const sessionsCompletedOverTime = Object.entries(sessionsByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Get all sessions with completion counts for bar chart
    const allSessionsWithCounts = sessions
      .sort((a, b) => b.count - a.count)
      .map(s => ({
        name: s.sessionName,
        count: s.count
      }));
    
    return {
      totalCompletions: allSessionHistory.length,
      averageDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      mostCompletedSession: mostCompleted,
      leastCompletedSession: leastCompleted,
      sessionsCompletedOverTime: sessionsCompletedOverTime.slice(-30), // Last 30 days
      allSessionsWithCounts // For bar chart
    };
  }
  
  /**
   * Calculate exercise analytics
   */
  calculateExerciseMetrics(allExerciseHistory) {
    const exercises = Object.values(allExerciseHistory);
    
    if (exercises.length === 0) {
      return {
        mostPerformedExercises: [],
        totalUniqueExercises: 0
      };
    }
    
    // Sort by total sessions (most performed)
    const mostPerformed = exercises
      .map(ex => ({
        exerciseKey: ex.exerciseKey,
        totalSessions: ex.totalSessions,
        totalSets: ex.totalSets,
        uniqueUsers: ex.users
      }))
      .sort((a, b) => b.totalSessions - a.totalSessions)
      .slice(0, 10);
    
    return {
      mostPerformedExercises: mostPerformed,
      totalUniqueExercises: exercises.length
    };
  }
  
  /**
   * Calculate user progression metrics
   */
  calculateProgressionMetrics(enrolledUsers) {
    const usersWithProgress = enrolledUsers.filter(user => user.courseProgress);
    
    const progressionBuckets = {
      zero: 0,
      oneToFive: 0,
      sixToTen: 0,
      tenPlus: 0
    };
    
    let totalWeeklyStreak = 0;
    let streakCount = 0;
    
    usersWithProgress.forEach(user => {
      const sessionsCompleted = user.courseProgress.totalSessionsCompleted || 0;
      
      if (sessionsCompleted === 0) {
        progressionBuckets.zero++;
      } else if (sessionsCompleted >= 1 && sessionsCompleted <= 5) {
        progressionBuckets.oneToFive++;
      } else if (sessionsCompleted >= 6 && sessionsCompleted <= 10) {
        progressionBuckets.sixToTen++;
      } else {
        progressionBuckets.tenPlus++;
      }
      
      if (user.courseProgress.weeklyStreak?.weeksCompleted) {
        totalWeeklyStreak += user.courseProgress.weeklyStreak.weeksCompleted;
        streakCount++;
      }
    });
    
    return {
      usersWithZeroSessions: progressionBuckets.zero,
      usersWithOneToFiveSessions: progressionBuckets.oneToFive,
      usersWithSixToTenSessions: progressionBuckets.sixToTen,
      usersWithTenPlusSessions: progressionBuckets.tenPlus,
      averageWeeklyStreak: streakCount > 0 
        ? (totalWeeklyStreak / streakCount).toFixed(1)
        : 0
    };
  }

  /**
   * Aggregate analytics from multiple programs
   * This combines data from all programs for a creator
   */
  async getAggregatedAnalyticsForCreator(programIds) {
    try {
      if (!programIds || programIds.length === 0) {
        // Return empty analytics structure
        return {
          enrollment: {
            totalEnrolled: 0,
            activeEnrollments: 0,
            trialUsers: 0,
            expiredEnrollments: 0,
            cancelledEnrollments: 0,
            recentEnrollments30Days: 0,
            recentEnrollmentsPercentageChange: 0,
            averageEnrollmentDurationDays: 0,
            demographics: {},
            mostCommonCustomer: null,
            enrollmentsOverTime: []
          },
          engagement: {
            totalSessionsCompleted: 0,
            averageSessionsPerUser: 0,
            completionRate: 0,
            usersWithAtLeastOneSession: 0,
            topActiveUsers: [],
            sessionsCompletedOverTime: []
          },
          sessions: {
            totalCompletions: 0,
            averageDuration: 0,
            mostCompletedSession: null,
            leastCompletedSession: null,
            allSessionsWithCounts: [],
            sessionsCompletedOverTime: []
          },
          exercises: {
            totalCompletions: 0,
            averageDuration: 0,
            mostCompletedExercise: null,
            leastCompletedExercise: null,
            allExercisesWithCounts: []
          },
          progression: {
            usersWithZeroSessions: 0,
            usersWithOneToFiveSessions: 0,
            usersWithSixToTenSessions: 0,
            usersWithTenPlusSessions: 0,
            averageWeeklyStreak: 0
          },
          programs: {}
        };
      }

      // First, collect ALL enrolled users from ALL programs
      // This is needed for proper aggregation of mostCommonCustomer and enrollmentsOverTime
      const allEnrolledUsersPromises = programIds.map(async (programId) => {
        try {
          const enrolledUsers = await this.getEnrolledUsers(programId);
          return enrolledUsers.map(user => ({ ...user, programId }));
        } catch (error) {
          console.error(`Error fetching enrolled users for program ${programId}:`, error);
          return [];
        }
      });
      
      const allEnrolledUsersArrays = await Promise.all(allEnrolledUsersPromises);
      const allEnrolledUsers = allEnrolledUsersArrays.flat();

      // Fetch analytics for all programs in parallel
      const analyticsPromises = programIds.map(programId => 
        this.getProgramAnalytics(programId).catch(error => {
          console.error(`Error fetching analytics for program ${programId}:`, error);
          return { programId, analytics: null }; // Return null for failed programs
        }).then(analytics => ({ programId, analytics }))
      );

      const allAnalytics = await Promise.all(analyticsPromises);
      const validAnalytics = allAnalytics.filter(a => a.analytics !== null);

      if (validAnalytics.length === 0) {
        return this.getAggregatedAnalyticsForCreator([]); // Return empty structure
      }

      // Aggregate enrollment metrics
      const aggregatedEnrollment = {
        totalEnrolled: 0,
        activeEnrollments: 0,
        trialUsers: 0,
        expiredEnrollments: 0,
        cancelledEnrollments: 0,
        recentEnrollments30Days: 0,
        recentEnrollmentsPercentageChange: 0,
        averageEnrollmentDurationDays: 0,
        demographics: {
          age: { distribution: {}, average: 0 },
          gender: {},
          topCities: []
        },
        mostCommonCustomer: null,
        enrollmentsOverTime: []
      };

      // Aggregate engagement metrics
      const aggregatedEngagement = {
        totalSessionsCompleted: 0,
        averageSessionsPerUser: 0,
        completionRate: 0,
        usersWithAtLeastOneSession: 0,
        topActiveUsers: [],
        sessionsCompletedOverTime: []
      };

      // Aggregate session metrics
      const aggregatedSessions = {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedSession: null,
        leastCompletedSession: null,
        allSessionsWithCounts: [],
        sessionsCompletedOverTime: []
      };

      // Aggregate exercise metrics
      const aggregatedExercises = {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedExercise: null,
        leastCompletedExercise: null,
        allExercisesWithCounts: []
      };

      // Aggregate progression metrics
      const aggregatedProgression = {
        usersWithZeroSessions: 0,
        usersWithOneToFiveSessions: 0,
        usersWithSixToTenSessions: 0,
        usersWithTenPlusSessions: 0,
        averageWeeklyStreak: 0
      };

      // Track unique users across all programs
      const uniqueUsers = new Set();
      const userSessionCounts = new Map(); // userId -> total sessions
      const userSessionsCompletedOverTime = new Map(); // userId -> { date -> count }
      const allTopActiveUsers = [];
      const ageDistribution = {};
      const genderDistribution = {};
      const cityCounts = {};
      const onboardingAnswersCounts = {}; // For most common customer - from ALL users
      const enrollmentsOverTimeMap = new Map(); // date -> { enrollments, trials }
      const programStats = {}; // programId -> { users: count }
      const programUserSets = {}; // programId -> Set of userIds for unique user counting
      let totalEnrollmentDuration = 0;
      let enrollmentCount = 0;
      let totalDuration = 0;
      let durationCount = 0;
      let totalExerciseDuration = 0;
      let exerciseDurationCount = 0;
      const sessionCountsMap = new Map(); // sessionName -> count
      const exerciseCountsMap = new Map(); // exerciseName -> count
      const sessionsOverTimeMap = new Map(); // date -> count
      let totalWeeklyStreak = 0;
      let streakCount = 0;

      // Initialize program user sets
      programIds.forEach(programId => {
        programUserSets[programId] = new Set();
      });
      
      // Track unique users per program from allEnrolledUsers
      allEnrolledUsers.forEach(user => {
        if (user.programId && programUserSets[user.programId]) {
          programUserSets[user.programId].add(user.userId);
        }
      });
      
      // Calculate program stats
      Object.keys(programUserSets).forEach(programId => {
        programStats[programId] = { users: programUserSets[programId].size };
      });

      // Calculate enrollmentsOverTime from ALL enrolled users across ALL programs
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const enrollmentsByDate = {};
      const trialsByDate = {};
      
      // Initialize all dates in the last 30 days
      for (let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        enrollmentsByDate[dateStr] = 0;
        trialsByDate[dateStr] = 0;
      }
      
      // Count enrollments and trials by date from ALL users
      allEnrolledUsers.forEach(user => {
        const purchasedAt = user.courseData?.purchased_at ? new Date(user.courseData.purchased_at) : null;
        if (purchasedAt && purchasedAt >= thirtyDaysAgo) {
          const dateStr = purchasedAt.toISOString().split('T')[0];
          if (enrollmentsByDate.hasOwnProperty(dateStr)) {
            enrollmentsByDate[dateStr]++;
            if (user.courseData?.is_trial === true) {
              trialsByDate[dateStr]++;
            }
          }
        }
      });
      
      // Convert to array format for enrollmentsOverTime
      const aggregatedEnrollmentsOverTime = Object.keys(enrollmentsByDate)
        .sort()
        .map(date => ({
          date,
          enrollments: enrollmentsByDate[date],
          trials: trialsByDate[date]
        }));

      // Calculate demographics from ALL enrolled users (for most common customer and aggregated demographics)
      allEnrolledUsers.forEach(user => {
        // Age - aggregate into buckets for distribution
        if (user.userAge) {
          const ageBucket = this.getAgeBucket(user.userAge);
          if (ageBucket) {
            ageDistribution[ageBucket] = (ageDistribution[ageBucket] || 0) + 1;
          }
        }
        
        // Gender
        if (user.userGender) {
          const gender = user.userGender.toLowerCase();
          genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
        }
        
        // City
        if (user.userCity) {
          cityCounts[user.userCity] = (cityCounts[user.userCity] || 0) + 1;
        }
        
        // Onboarding answers (for most common customer calculation)
        if (user.onboardingData && typeof user.onboardingData === 'object') {
          Object.entries(user.onboardingData).forEach(([key, value]) => {
            if (key.toLowerCase() !== 'completedat' && key.toLowerCase() !== 'completed_at') {
              if (!onboardingAnswersCounts[key]) {
                onboardingAnswersCounts[key] = {};
              }
              const answerKey = String(value || 'N/A');
              onboardingAnswersCounts[key][answerKey] = (onboardingAnswersCounts[key][answerKey] || 0) + 1;
            }
          });
        }
      });
      
      // Calculate average age from all users
      const allAges = allEnrolledUsers.map(u => u.userAge).filter(a => a && a > 0 && a < 120);
      const averageAge = allAges.length > 0 
        ? Math.round(allAges.reduce((sum, age) => sum + age, 0) / allAges.length)
        : 0;

      // Process each program's analytics
      validAnalytics.forEach(({ programId, analytics }) => {
        
        // Enrollment
        aggregatedEnrollment.totalEnrolled += analytics.enrollment.totalEnrolled || 0;
        aggregatedEnrollment.activeEnrollments += analytics.enrollment.activeEnrollments || 0;
        aggregatedEnrollment.trialUsers += analytics.enrollment.trialUsers || 0;
        aggregatedEnrollment.expiredEnrollments += analytics.enrollment.expiredEnrollments || 0;
        aggregatedEnrollment.cancelledEnrollments += analytics.enrollment.cancelledEnrollments || 0;
        aggregatedEnrollment.recentEnrollments30Days += analytics.enrollment.recentEnrollments30Days || 0;
        
        // Note: Demographics are already calculated from allEnrolledUsers above
        // We don't need to aggregate from individual programs as that would double count

        // Engagement
        aggregatedEngagement.totalSessionsCompleted += analytics.engagement.totalSessionsCompleted || 0;
        aggregatedEngagement.usersWithAtLeastOneSession += analytics.engagement.usersWithAtLeastOneSession || 0;

        // Collect top active users (we'll aggregate and sort later)
        if (analytics.engagement.topActiveUsers) {
          analytics.engagement.topActiveUsers.forEach(user => {
            allTopActiveUsers.push(user);
            uniqueUsers.add(user.userId);
            const currentCount = userSessionCounts.get(user.userId) || 0;
            userSessionCounts.set(user.userId, currentCount + user.sessionsCompleted);
          });
        }

        // Sessions completed over time
        if (analytics.engagement.sessionsCompletedOverTime) {
          analytics.engagement.sessionsCompletedOverTime.forEach(item => {
            const currentCount = sessionsOverTimeMap.get(item.date) || 0;
            sessionsOverTimeMap.set(item.date, currentCount + item.count);
          });
        }

        // Session metrics
        aggregatedSessions.totalCompletions += analytics.sessions.totalCompletions || 0;
        if (analytics.sessions.averageDuration > 0) {
          totalDuration += analytics.sessions.averageDuration;
          durationCount++;
        }

        if (analytics.sessions.allSessionsWithCounts) {
          analytics.sessions.allSessionsWithCounts.forEach(session => {
            const currentCount = sessionCountsMap.get(session.name) || 0;
            sessionCountsMap.set(session.name, currentCount + session.count);
          });
        }

        // Exercise metrics
        aggregatedExercises.totalCompletions += analytics.exercises.totalCompletions || 0;
        if (analytics.exercises.averageDuration > 0) {
          totalExerciseDuration += analytics.exercises.averageDuration;
          exerciseDurationCount++;
        }

        if (analytics.exercises.allExercisesWithCounts) {
          analytics.exercises.allExercisesWithCounts.forEach(exercise => {
            const currentCount = exerciseCountsMap.get(exercise.name) || 0;
            exerciseCountsMap.set(exercise.name, currentCount + exercise.count);
          });
        }

        // Progression
        aggregatedProgression.usersWithZeroSessions += analytics.progression.usersWithZeroSessions || 0;
        aggregatedProgression.usersWithOneToFiveSessions += analytics.progression.usersWithOneToFiveSessions || 0;
        aggregatedProgression.usersWithSixToTenSessions += analytics.progression.usersWithSixToTenSessions || 0;
        aggregatedProgression.usersWithTenPlusSessions += analytics.progression.usersWithTenPlusSessions || 0;
        if (analytics.progression.averageWeeklyStreak) {
          totalWeeklyStreak += parseFloat(analytics.progression.averageWeeklyStreak);
          streakCount++;
        }
      });

      // Calculate averages
      aggregatedEnrollment.averageEnrollmentDurationDays = enrollmentCount > 0 
        ? (totalEnrollmentDuration / enrollmentCount).toFixed(1) 
        : 0;
      aggregatedSessions.averageDuration = durationCount > 0 
        ? (totalDuration / durationCount) 
        : 0;
      aggregatedExercises.averageDuration = exerciseDurationCount > 0 
        ? (totalExerciseDuration / exerciseDurationCount) 
        : 0;
      aggregatedProgression.averageWeeklyStreak = streakCount > 0 
        ? (totalWeeklyStreak / streakCount).toFixed(1) 
        : 0;

      // Calculate engagement averages
      const uniqueUserCount = uniqueUsers.size;
      aggregatedEngagement.averageSessionsPerUser = uniqueUserCount > 0 
        ? (aggregatedEngagement.totalSessionsCompleted / uniqueUserCount).toFixed(1) 
        : 0;
      aggregatedEngagement.completionRate = aggregatedEnrollment.totalEnrolled > 0 
        ? Math.round((aggregatedEngagement.usersWithAtLeastOneSession / aggregatedEnrollment.totalEnrolled) * 100) 
        : 0;

      // Aggregate top active users
      const aggregatedTopUsers = Array.from(userSessionCounts.entries())
        .map(([userId, sessionsCompleted]) => {
          const user = allTopActiveUsers.find(u => u.userId === userId);
          return {
            userId,
            userName: user?.userName || userId.slice(0, 8) + '...',
            sessionsCompleted
          };
        })
        .sort((a, b) => b.sessionsCompleted - a.sessionsCompleted)
        .slice(0, 10);

      aggregatedEngagement.topActiveUsers = aggregatedTopUsers;

      // Aggregate sessions completed over time
      aggregatedEngagement.sessionsCompletedOverTime = Array.from(sessionsOverTimeMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Use the enrollmentsOverTime calculated from ALL enrolled users
      aggregatedEnrollment.enrollmentsOverTime = aggregatedEnrollmentsOverTime;

      // Aggregate session counts
      aggregatedSessions.allSessionsWithCounts = Array.from(sessionCountsMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      if (aggregatedSessions.allSessionsWithCounts.length > 0) {
        aggregatedSessions.mostCompletedSession = {
          sessionName: aggregatedSessions.allSessionsWithCounts[0].name,
          count: aggregatedSessions.allSessionsWithCounts[0].count
        };
        aggregatedSessions.leastCompletedSession = {
          sessionName: aggregatedSessions.allSessionsWithCounts[aggregatedSessions.allSessionsWithCounts.length - 1].name,
          count: aggregatedSessions.allSessionsWithCounts[aggregatedSessions.allSessionsWithCounts.length - 1].count
        };
      }

      // Aggregate exercise counts
      aggregatedExercises.allExercisesWithCounts = Array.from(exerciseCountsMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      if (aggregatedExercises.allExercisesWithCounts.length > 0) {
        aggregatedExercises.mostCompletedExercise = {
          exerciseName: aggregatedExercises.allExercisesWithCounts[0].name,
          count: aggregatedExercises.allExercisesWithCounts[0].count
        };
        aggregatedExercises.leastCompletedExercise = {
          exerciseName: aggregatedExercises.allExercisesWithCounts[aggregatedExercises.allExercisesWithCounts.length - 1].name,
          count: aggregatedExercises.allExercisesWithCounts[aggregatedExercises.allExercisesWithCounts.length - 1].count
        };
      }

      // Calculate demographics (already calculated from allEnrolledUsers)
      aggregatedEnrollment.demographics.age = {
        distribution: ageDistribution,
        average: averageAge
      };
      aggregatedEnrollment.demographics.gender = genderDistribution;
      aggregatedEnrollment.demographics.topCities = Object.entries(cityCounts)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Calculate most common customer from ALL enrolled users
      const validUsersForProfile = allEnrolledUsers.filter(user => 
        user.userAge || user.userGender || user.userCity || user.onboardingData
      );
      
      if (validUsersForProfile.length > 0) {
        // Calculate most common age (average of all ages, not from buckets)
        const ages = validUsersForProfile.map(u => u.userAge).filter(a => a && a > 0 && a < 120);
        const mostCommonAge = ages.length > 0 
          ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
          : null;
        
        // Calculate most common gender
        const mostCommonGender = Object.keys(genderDistribution).length > 0
          ? Object.entries(genderDistribution).sort((a, b) => b[1] - a[1])[0][0]
          : null;
        
        // Calculate most common city
        const mostCommonCity = Object.keys(cityCounts).length > 0
          ? Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0][0]
          : null;
        
        // Calculate most common onboarding answers
        const mostCommonOnboarding = {};
        Object.entries(onboardingAnswersCounts).forEach(([question, answers]) => {
          const mostCommon = Object.entries(answers).sort((a, b) => b[1] - a[1])[0];
          if (mostCommon) {
            mostCommonOnboarding[question] = mostCommon[0];
          }
        });

        aggregatedEnrollment.mostCommonCustomer = {
          age: mostCommonAge,
          gender: mostCommonGender,
          city: mostCommonCity,
          onboardingAnswers: Object.keys(mostCommonOnboarding).length > 0 ? mostCommonOnboarding : null,
          sampleSize: validUsersForProfile.length
        };
      }

      return {
        enrollment: aggregatedEnrollment,
        engagement: aggregatedEngagement,
        sessions: aggregatedSessions,
        exercises: aggregatedExercises,
        progression: aggregatedProgression,
        programs: programStats
      };
    } catch (error) {
      console.error('❌ Error aggregating analytics:', error);
      throw error;
    }
  }
}

export default new ProgramAnalyticsService();


