import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShimmerSkeleton } from '../ui';
import apiClient from '../../utils/apiClient';
import './InstagramCarousel.css';

const ROWS = 3;

const InstagramCarousel = ({ feedId }) => {
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const { data: feedData, isLoading, isError } = useQuery({
    queryKey: ['creator', 'instagram-feed', feedId],
    queryFn: () => apiClient.get('/creator/instagram-feed').then((r) => r.data),
    enabled: !!feedId,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="ig-carousel">
        <div className="ig-carousel__grid ig-carousel__grid--loading">
          {Array.from({ length: 9 }).map((_, i) => (
            <ShimmerSkeleton key={i} width="100%" height="0" style={{ paddingBottom: '100%' }} borderRadius="8px" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ig-carousel">
        <p className="ig-carousel__error">No se pudo cargar el feed</p>
      </div>
    );
  }

  const posts = feedData || [];

  if (!Array.isArray(posts) || posts.length === 0) {
    return (
      <div className="ig-carousel">
        <p className="ig-carousel__empty">Sin publicaciones disponibles</p>
      </div>
    );
  }

  const columns = Math.ceil(posts.length / ROWS);

  return (
    <div className="ig-carousel">
      <div className="ig-carousel__scroll">
        <div
          className="ig-carousel__grid"
          style={{
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            gridTemplateColumns: `repeat(${columns}, 100px)`,
          }}
        >
          {posts.map((post, i) => {
            const thumb = post.thumbnailUrl || post.mediaUrl || post.sizes?.small?.mediaUrl;
            const full = post.mediaUrl || post.sizes?.large?.mediaUrl || thumb;
            if (!thumb) return null;

            return (
              <button
                key={post.id || i}
                className="ig-carousel__tile"
                onClick={() => setLightboxUrl(full)}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <img
                  src={thumb}
                  alt={post.caption ? post.caption.slice(0, 60) : `Instagram ${i + 1}`}
                  className="ig-carousel__img"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      </div>

      {lightboxUrl && (
        <div className="ig-carousel__lightbox" onClick={() => setLightboxUrl(null)}>
          <div className="ig-carousel__lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Instagram" className="ig-carousel__lightbox-img" />
            <button className="ig-carousel__lightbox-close" onClick={() => setLightboxUrl(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramCarousel;
