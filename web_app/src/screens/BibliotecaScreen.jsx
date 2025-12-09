import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import UserDashboardLayout from '../components/UserDashboardLayout';
import { getAvailableCourses } from '../services/courseService';
import Input from '../components/Input';
import './BibliotecaScreen.css';

const BibliotecaScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available courses
  const { data: courses = [], isLoading, error } = useQuery({
    queryKey: ['availableCourses', user?.uid],
    queryFn: () => getAvailableCourses(user?.uid),
    enabled: !!user,
  });

  // Filter courses based on search query
  const filteredCourses = courses.filter(course => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const title = (course.title || '').toLowerCase();
    const description = (course.description || '').toLowerCase();
    const creatorName = (course.creatorName || course.creator_name || '').toLowerCase();
    
    return title.includes(query) || 
           description.includes(query) || 
           creatorName.includes(query);
  });

  const handleCourseClick = (courseId) => {
    navigate(`/course/${courseId}`);
  };

  return (
    <UserDashboardLayout screenName="Biblioteca">
      <div className="biblioteca-content">
        {/* Search Bar */}
        <div className="biblioteca-search-container">
          <Input
            placeholder="Buscar programas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
          />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="biblioteca-loading">
            <div className="spinner"></div>
            <p>Cargando programas...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="biblioteca-error">
            <p>Error al cargar los programas. Por favor intenta de nuevo.</p>
          </div>
        )}

        {/* Courses Grid */}
        {!isLoading && !error && (
          <>
            {filteredCourses.length === 0 ? (
              <div className="biblioteca-empty">
                {searchQuery ? (
                  <p>No se encontraron programas que coincidan con tu búsqueda.</p>
                ) : (
                  <p>No hay programas disponibles en este momento.</p>
                )}
              </div>
            ) : (
              <div className="biblioteca-courses-grid">
                {filteredCourses.map((course) => (
                  <div
                    key={course.id}
                    className="biblioteca-course-card"
                    onClick={() => handleCourseClick(course.id)}
                  >
                    {course.image_url ? (
                      <div 
                        className="biblioteca-course-image"
                        style={{ backgroundImage: `url(${course.image_url})` }}
                      />
                    ) : (
                      <div className="biblioteca-course-image biblioteca-course-image-placeholder">
                        <span>Sin imagen</span>
                      </div>
                    )}
                    
                    <div className="biblioteca-course-info">
                      <h3 className="biblioteca-course-title">
                        {course.title || 'Programa sin título'}
                      </h3>
                      
                      {course.creatorName || course.creator_name ? (
                        <span className="biblioteca-course-creator">
                          Por {course.creatorName || course.creator_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </UserDashboardLayout>
  );
};

export default BibliotecaScreen;

