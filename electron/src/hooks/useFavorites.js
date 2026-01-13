import { useState, useEffect, useCallback } from 'react';

export function useFavorites({ currentProfile }) {
  const [favorites, setFavorites] = useState([]);

  // Sync favorites when profile changes
  useEffect(() => {
    if (currentProfile) {
      setFavorites(currentProfile.favorites || []);
    }
  }, [currentProfile?.id]);

  const toggleFavorite = useCallback(async (stream) => {
    const id = (stream.stream_id || stream.series_id || stream.id || "").toString();
    if (!id) return;

    setFavorites(prev => {
      const isFav = prev.includes(id);
      const next = isFav ? prev.filter(favId => favId !== id) : [...prev, id];
      
      (async () => {
        if (currentProfile) {
          try {
            const config = await window.api.config.load();
            const profileIndex = config.profiles.findIndex(p => p.id === currentProfile.id);
            if (profileIndex !== -1) {
                config.profiles[profileIndex].favorites = next;
                await window.api.config.save(config);
            }
          } catch (e) {
            console.error("Failed to persist favorites", e);
          }
        }
      })();
      
      return next;
    });
  }, [currentProfile?.id]);

  return {
    favorites,
    setFavorites,
    toggleFavorite
  };
}
