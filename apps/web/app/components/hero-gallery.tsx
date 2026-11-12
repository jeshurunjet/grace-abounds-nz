'use client';
import { useContent } from './content-provider';
import Image from './site-image';
import { useEffect, useState } from 'react';
export function HeroGallery() {
  const { content } = useContent();
  const images = content.pages.heroImages;
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setCurrent((value) => (value + 1) % images.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [images.length]);
  return (
    <div className="hero-gallery">
      {images.map((src, index) => (
        <Image
          key={src}
          className={index === current % images.length ? 'active' : ''}
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
            className={index === current % images.length ? 'active' : ''}
            onClick={() => setCurrent(index)}
          />
        ))}
      </div>
    </div>
  );
}
