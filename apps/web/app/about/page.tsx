'use client';
import { useContent } from '../components/content-provider';
import Image from '../components/site-image';
import {
  ContactForm,
  ManagedContact,
  ManagedStory,
  ManagedTeam,
} from '../components/managed-content';
import { Reveal } from '../components/reveal';

export default function About() {
  const { content } = useContent();
  const { values } = content.pages;
  return (
    <div className="reference-public-page">
      <section className="reference-page-hero about-reference-hero">
        <Image
          src={content.pages.aboutHeroImage}
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="container">
          <Reveal>
            <p className="eyebrow gold">Our Story</p>
          </Reveal>
          <Reveal delay={80}>
            <h1>
              About
              <br />
              <span>Us</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p>{content.pages.aboutIntro}</p>
          </Reveal>
        </div>
      </section>

      <section className="reference-section raised">
        <div className="container about-story-grid">
          <Reveal direction="right">
            <div>
              <h2>Our Story</h2>
              <ManagedStory />
            </div>
          </Reveal>
          <Reveal direction="left" delay={100}>
            <div className="about-story-image">
              <Image
                src={content.pages.aboutImage}
                alt="Grace Abounds International congregation"
                width={700}
                height={500}
              />
              <div>
                <strong>{content.pages.ministryYears}</strong>
                <span>Years of Ministry</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="reference-section">
        <div className="container">
          <Reveal>
            <div className="reference-section-heading">
              <p className="eyebrow">What We Believe</p>
              <h2>Our Values</h2>
            </div>
          </Reveal>
          <div className="about-values-grid">
            {values.map(([number, title, description], index) => (
              <Reveal delay={index * 80} key={number}>
                <article>
                  <small>{number}</small>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="reference-section raised">
        <div className="container">
          <Reveal>
            <div className="reference-section-heading">
              <p className="eyebrow olive">Leadership</p>
              <h2>Meet the Team</h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <ManagedTeam />
          </Reveal>
        </div>
      </section>

      <section className="reference-section about-contact" id="contact">
        <div className="container about-contact-grid">
          <Reveal direction="right">
            <div>
              <p className="eyebrow">Get in Touch</p>
              <h2>Contact Us</h2>
              <ManagedContact />
              <div className="contact-office-hours">
                <b>Office Hours</b>
                <span>{content.pages.officeHours}</span>
              </div>
            </div>
          </Reveal>
          <Reveal direction="left" delay={100}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
