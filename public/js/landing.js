'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize AOS
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 800,
      easing: 'ease-out-cubic',
      once: true,
      offset: 50,
    });
  }

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const STORAGE_KEY = 'kemist-theme';

  const getSystemTheme = () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const setTheme = (theme) => {
    html.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      themeToggle.setAttribute('aria-pressed', theme === 'dark');
    }
  };

  const initTheme = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setTheme(saved);
    } else {
      setTheme(getSystemTheme());
    }
  };

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  initTheme();

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Parallax effect for hero illustration
  const heroIllustration = document.querySelector('.hero-illustration');
  if (heroIllustration) {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY;
          const rate = scrolled * 0.15;
          heroIllustration.style.transform = `translateY(${rate}px)`;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // Animate particles
  const particles = document.querySelectorAll('.particles circle');
  particles.forEach((particle, i) => {
    const delay = i * 800;
    particle.style.animationDelay = `${delay}ms`;
  });
});