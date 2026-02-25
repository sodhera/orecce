import { motion } from 'framer-motion';

export const ThemeToggle = ({ isDark, toggleTheme }: { isDark: boolean; toggleTheme: () => void }) => {
    return (
        <button
            onClick={toggleTheme}
            style={{
                position: 'relative',
                width: '64px',
                height: '32px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                overflow: 'hidden',
                background: isDark ? '#1a1a2e' : '#87CEEB',
                transition: 'background 0.5s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
            }}
        >
            {/* Starry background for dark mode */}
            <motion.div
                initial={false}
                animate={{ opacity: isDark ? 1 : 0 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}
            >
                <div style={{ position: 'absolute', top: '10px', left: '16px', width: '2px', height: '2px', background: 'white', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', top: '20px', left: '24px', width: '1px', height: '1px', background: 'white', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', top: '12px', left: '30px', width: '2px', height: '2px', background: 'white', borderRadius: '50%', opacity: 0.8 }} />
            </motion.div>

            {/* Cloud for light mode */}
            <motion.div
                initial={false}
                animate={{ opacity: isDark ? 0 : 1, x: isDark ? 10 : 0 }}
                style={{ position: 'absolute', bottom: '2px', left: '8px', width: '24px', height: '10px', background: 'rgba(255,255,255,0.8)', borderRadius: '10px', pointerEvents: 'none' }}
            >
                <div style={{ position: 'absolute', top: '-6px', left: '4px', width: '12px', height: '12px', background: 'rgba(255,255,255,0.8)', borderRadius: '50%' }} />
            </motion.div>

            {/* The Sun / Moon element */}
            <motion.div
                layout
                transition={{ type: "spring", stiffness: 700, damping: 30 }}
                style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '4px',
                    left: isDark ? '36px' : '4px',
                    boxShadow: isDark
                        ? 'inset -4px -2px 0 0 #fde047' // Moon crescent
                        : '0 0 10px rgba(253, 224, 71, 0.8), inset 0 0 0 12px #fde047', // Sun
                    background: isDark ? 'transparent' : '#fde047'
                }}
            />
        </button>
    );
};
