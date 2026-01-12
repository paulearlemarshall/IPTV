import React from 'react';
import { Star } from 'lucide-react';

const StarRating = ({ rating, max = 10, size = 10 }) => {
  const stars = [];
  const fullStars = Math.floor(rating);
  const fractionalPart = rating % 1;

  for (let i = 0; i < max; i++) {
    if (i < fullStars) {
      stars.push(<Star key={i} size={size} fill="#ffd43b" color="#ffd43b" />);
    } else if (i === fullStars && fractionalPart > 0) {
      stars.push(
        <div key={i} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
          <Star size={size} color="#333" />
          <div style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: `${Math.round(fractionalPart * 100)}%`, 
            overflow: 'hidden',
            lineHeight: 0
          }}>
            <Star size={size} fill="#ffd43b" color="#ffd43b" />
          </div>
        </div>
      );
    } else {
      stars.push(<Star key={i} size={size} color="#333" />);
    }
  }
  
  if (rating === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '1px', alignItems: 'center' }} title={`Rating: ${rating}/10`}>
      {stars}
      <span style={{ marginLeft: '4px', fontSize: size > 12 ? '1rem' : '0.7rem', color: '#ffd43b', fontWeight: 'bold' }}>
        {rating.toFixed(1)}
      </span>
    </div>
  );
};

export default StarRating;
