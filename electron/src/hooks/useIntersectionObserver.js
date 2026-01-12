import { useState, useEffect, useRef } from 'react';

export function useIntersectionObserver(ref, options = {}) {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || isVisible) return;

    observerRef.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        if (observerRef.current) observerRef.current.disconnect();
      }
    }, options);

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [ref, isVisible, options.rootMargin, options.threshold, options.root]);

  return [isVisible, setIsVisible];
}
