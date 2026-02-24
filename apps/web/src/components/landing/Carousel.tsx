"use client";

import { useCallback, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
import confetti from "canvas-confetti";
import styles from "./LandingPage.module.css";

interface CardData {
  id: number;
  title: string;
  summary: ReactNode;
  image: string;
  tag: string;
}

const cards: CardData[] = [
  {
    id: 1,
    title: "Personalized Diets",
    summary:
      "Get personalized content that is exciting without being addictive.",
    image: "var(--landing-card-1)",
    tag: "Wellness",
  },
  {
    id: 2,
    title: "Death to Doomscrolling",
    summary:
      "Curate your mind with media that makes you feel better about yourself.",
    image: "var(--landing-card-2)",
    tag: "Focus",
  },
  {
    id: 3,
    title: "Autonomy",
    summary: (
      <>
        Nobody promotes anything to you. Nobody knows what you see.
        <br />
        It&apos;s your world.
      </>
    ),
    image: "var(--landing-card-3)",
    tag: "Design",
  },
];

export default function Carousel() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [likedCards, setLikedCards] = useState<Record<number, boolean>>({});

  const nextSlide = () => setActiveIdx((prev) => (prev + 1) % cards.length);
  const prevSlide = () =>
    setActiveIdx((prev) => (prev - 1 + cards.length) % cards.length);

  const handleLike = useCallback(
    (cardId: number, button: HTMLButtonElement) => {
      if (!likedCards[cardId]) {
        setLikedCards((prev) => ({ ...prev, [cardId]: true }));

        const rect = button.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;
        const end = Date.now() + 450;

        (function frame() {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: x - 0.05, y },
            colors: ["#ef4444", "#f87171", "#ffc0cb"],
            shapes: ["circle"],
          });

          confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: x + 0.05, y },
            colors: ["#ef4444", "#f87171", "#ffc0cb"],
            shapes: ["circle"],
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        })();
      } else {
        setLikedCards((prev) => ({ ...prev, [cardId]: false }));
      }
    },
    [likedCards],
  );

  return (
    <div className={styles.carouselWrap}>
      <button
        type="button"
        onClick={prevSlide}
        className={styles.carouselNavButton}
        aria-label="Previous card"
      >
        <ArrowLeft size={36} strokeWidth={1.5} />
      </button>

      <div className={styles.cardStack}>
        {cards.map((card, index) => {
          let offset = index - activeIdx;
          if (offset < -1) offset += cards.length;
          if (offset > 1) offset -= cards.length;

          const isCenter = offset === 0;
          const isLeft = offset === -1;

          const x = isCenter ? 0 : isLeft ? -40 : 40;
          const z = isCenter ? 0 : -100;
          const rotateY = isCenter ? 0 : isLeft ? 15 : -15;
          const opacity = isCenter ? 1 : 0.6;
          const zIndex = isCenter ? 10 : 5;

          return (
            <motion.div
              key={card.id}
              animate={{
                x,
                y: 0,
                z,
                rotateY,
                scale: 1,
                opacity,
              }}
              transition={{ type: "spring", stiffness: 450, damping: 20, mass: 0.6 }}
              className={styles.liquidGlass}
              style={{
                zIndex,
                background: card.image,
                boxShadow: isCenter
                  ? "0 30px 60px -12px rgba(0,0,0,0.1), 0 18px 36px -18px rgba(0,0,0,0.1)"
                  : "none",
              }}
            >
              <div className={styles.cardContent} style={{ pointerEvents: isCenter ? "auto" : "none" }}>
                <span className={styles.cardTag}>{card.tag}</span>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardSummary}>{card.summary}</p>
              </div>

              <div className={styles.cardFooter} style={{ pointerEvents: isCenter ? "auto" : "none" }}>
                <button
                  type="button"
                  className={styles.likeButton}
                  onClick={(e) => handleLike(card.id, e.currentTarget)}
                  aria-label={likedCards[card.id] ? "Unlike card" : "Like card"}
                >
                  <Heart
                    size={20}
                    style={{
                      fill: likedCards[card.id] ? "#ef4444" : "transparent",
                      color: likedCards[card.id] ? "#ef4444" : "currentColor",
                    }}
                  />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={nextSlide}
        className={styles.carouselNavButton}
        aria-label="Next card"
      >
        <ArrowRight size={36} strokeWidth={1.5} />
      </button>
    </div>
  );
}
