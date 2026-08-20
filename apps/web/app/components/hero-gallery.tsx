'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
const images = Array.from(
  { length: 6 },
  (_, index) => `/images/hero-${index + 1}.jpg`,
);
export function HeroGallery() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setCurrent((value) => (value + 1) % images.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="hero-gallery" aria-hidden="true">
      {images.map((src, index) => (
        <Image
          key={src}
          className={index === current ? 'active' : ''}
          src={src}
          alt=""
          fill
          priority={index === 0}
          sizes="100vw"
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-warmth" />
      <div className="hero-fade" />
      <div className="hero-vignette" />
      <div className="hero-dots">
        {images.map((src, index) => (
          <button
            key={src}
            type="button"
            aria-label={`Show background image ${index + 1}`}
            className={index === current ? 'active' : ''}
            onClick={() => setCurrent(index)}
          />
        ))}
      </div>
    </div>
  );
}
