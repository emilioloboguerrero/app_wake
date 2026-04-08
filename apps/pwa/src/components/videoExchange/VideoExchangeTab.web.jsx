import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import VideoExchangeThreadList from './VideoExchangeThreadList.web';
import VideoExchangeThreadView from './VideoExchangeThreadView.web';

const db = getFirestore();

export default function VideoExchangeTab({ userId, courseId, creatorId }) {
  const [selectedThread, setSelectedThread] = useState(null);

  // Resolve the oneOnOneClientId from Firestore
  const { data: oneOnOneClientId } = useQuery({
    queryKey: ['oneOnOneClient', userId, creatorId],
    queryFn: async () => {
      const q = query(
        collection(db, 'one_on_one_clients'),
        where('clientUserId', '==', userId),
        where('creatorId', '==', creatorId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].id;
    },
    enabled: !!userId && !!creatorId,
    staleTime: 30 * 60 * 1000,
  });

  if (!oneOnOneClientId) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        Cargando...
      </div>
    );
  }

  if (selectedThread) {
    return (
      <VideoExchangeThreadView
        exchangeId={selectedThread}
        userId={userId}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

  return (
    <VideoExchangeThreadList
      userId={userId}
      oneOnOneClientId={oneOnOneClientId}
      creatorId={creatorId}
      onSelectThread={setSelectedThread}
    />
  );
}
