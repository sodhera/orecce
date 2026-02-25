import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Heart } from 'lucide-react';
import confetti from 'canvas-confetti';

const cards = [
    {
        id: 1,
        title: 'Personalized Diets',
        summary: 'Get personalized content that is exciting without being addictive.',
        image: 'var(--card-1)',
        tag: 'Wellness'
    },
    {
        id: 2,
        title: 'Death to Doomscrolling',
        summary: 'Curate your mind with media that makes you feel better about yourself.',
        image: 'var(--card-2)',
        tag: 'Focus'
    },
    {
        id: 3,
        title: 'Autonomy',
        summary: <>Nobody promotes anything to you. Nobody knows what you see.<br /> It's your world.</>,
        image: 'var(--card-3)',
        tag: 'Design'
    }
];

export const Carousel = () => {
    const [activeIdx, setActiveIdx] = useState(0);
    const [likedCards, setLikedCards] = useState<Record<number, boolean>>({});

    const nextSlide = () => setActiveIdx((prev) => (prev + 1) % cards.length);
    const prevSlide = () => setActiveIdx((prev) => (prev - 1 + cards.length) % cards.length);

    const handleLike = useCallback((e: React.MouseEvent, cardId: number) => {
        // Only trigger if it wasn't already liked
        if (!likedCards[cardId]) {
            setLikedCards(prev => ({ ...prev, [cardId]: true }));

            // Trigger heart confetti originating from the click coordinates
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const x = (rect.left + rect.width / 2) / window.innerWidth;
            const y = (rect.top + rect.height / 2) / window.innerHeight;

            const duration = 450;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: x - 0.05, y },
                    colors: ['#ef4444', '#f87171', '#ffc0cb'],
                    shapes: ['circle']
                });
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: x + 0.05, y },
                    colors: ['#ef4444', '#f87171', '#ffc0cb'],
                    shapes: ['circle']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        } else {
            // Unlike
            setLikedCards(prev => ({ ...prev, [cardId]: false }));
        }
    }, [likedCards]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '1rem', width: '100%', maxWidth: '100%', marginTop: '2rem' }}>

            {/* Left Arrow */}
            <button
                onClick={prevSlide}
                style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.2s', zIndex: 20 }}
                className="hover:text-black"
            >
                <ArrowLeft size={36} strokeWidth={1.5} />
            </button>

            {/* Card Stack Container */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '340px', height: '460px', perspective: '1200px', transformStyle: 'preserve-3d', flexShrink: 0 }}>

                {cards.map((card, index) => {
                    // Calculate relative position (-1, 0, 1) for 3 cards
                    let offset = index - activeIdx;
                    if (offset < -1) offset += cards.length;
                    if (offset > 1) offset -= cards.length;

                    const isCenter = offset === 0;
                    const isLeft = offset === -1;

                    const x = isCenter ? 0 : isLeft ? -40 : 40;
                    const z = isCenter ? 0 : -100;
                    const rotateY = isCenter ? 0 : isLeft ? 15 : -15;
                    const scale = 1;
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
                                scale,
                                opacity,
                            }}
                            transition={{ type: "spring", stiffness: 450, damping: 20, mass: 0.6 }}
                            className="liquid-glass"
                            style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                zIndex,
                                borderRadius: '24px',
                                background: card.image,
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                boxShadow: isCenter ? '0 30px 60px -12px rgba(0,0,0,0.1), 0 18px 36px -18px rgba(0,0,0,0.1)' : 'none',
                                transformOrigin: 'center center',
                            }}
                        >
                            <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 1, pointerEvents: isCenter ? 'auto' : 'none' }}>
                                <span style={{
                                    alignSelf: 'flex-start',
                                    background: 'var(--bg)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    padding: '6px 14px',
                                    borderRadius: '999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    marginBottom: '0.75rem'
                                }}>
                                    {card.tag}
                                </span>
                                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.1, color: 'var(--text)', marginBottom: '0.75rem', letterSpacing: '-0.04em' }}>
                                    {card.title}
                                </h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.5, fontWeight: 500 }}>
                                    {card.summary}
                                </p>
                            </div>

                            {/* Card Footer Actions */}
                            <div style={{ padding: '1rem 2rem', background: 'var(--bg)', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', borderTop: '1px solid var(--border)', pointerEvents: isCenter ? 'auto' : 'none' }}>
                                <div style={{ display: 'flex', gap: '1.25rem', color: 'var(--text-secondary)' }}>
                                    <Heart
                                        size={20}
                                        style={{ cursor: 'pointer', fill: likedCards[card.id] ? '#ef4444' : 'transparent', color: likedCards[card.id] ? '#ef4444' : 'currentColor' }}
                                        onClick={(e) => handleLike(e, card.id)}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    );
                })}

            </div>

            {/* Right Arrow */}
            <button
                onClick={nextSlide}
                style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.2s', zIndex: 20 }}
                className="hover:text-black"
            >
                <ArrowRight size={36} strokeWidth={1.5} />
            </button>

        </div>
    );
};
