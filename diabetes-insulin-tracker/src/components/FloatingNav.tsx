// FloatingNav — Draggable radial FAB replacing tab bar navigation.
//
// A floating action button that expands child navigation items in a
// radial/fan pattern, smartly choosing expansion direction based on
// which quadrant of the viewport it currently occupies.

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/** Tab type must match the one defined in App.tsx */
type Tab = 'calculator' | 'record' | 'history' | 'metrics' | 'profile';

export interface FloatingNavProps {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface NavItem {
  id: Tab;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'calculator', icon: '🧮' },
  { id: 'record', icon: '✏️' },
  { id: 'history', icon: '📊' },
  { id: 'metrics', icon: '📈' },
  { id: 'profile', icon: '⚙️' },
];

const RADIUS = 85;
const SPREAD_ANGLE = 0.6;
const FAB_SIZE = 60;
const CHILD_SIZE = 48;

/**
 * Determine the base angle for radial expansion, pointing AWAY from the
 * nearest edges (toward the center of the viewport).
 */
function getExpandDirection(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number,
): number {
  const centerX = viewportW / 2;
  const centerY = viewportH / 2;
  return Math.atan2(centerY - y, centerX - x);
}

export default function FloatingNav({ currentTab, onTabChange }: FloatingNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Track viewport size
  useEffect(() => {
    const handleResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compute FAB center position on screen (default bottom-right: right 24, bottom 24)
  const fabCenterX = viewport.w - 24 - FAB_SIZE / 2 + position.x;
  const fabCenterY = viewport.h - 24 - FAB_SIZE / 2 + position.y;

  const baseAngle = getExpandDirection(fabCenterX, fabCenterY, viewport.w, viewport.h);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleChildClick = useCallback(
    (tab: Tab) => {
      setIsOpen(false);
      onTabChange(tab);
    },
    [onTabChange],
  );

  return (
    <>
      {/* Invisible full-viewport container for drag constraints */}
      <div
        ref={constraintsRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      />

      {/* Backdrop to close menu when tapping outside */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'rgba(0,0,0,0.3)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Draggable FAB container */}
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragMomentum={false}
        onDragEnd={(_e, info) => {
          setPosition((prev) => ({
            x: prev.x + info.offset.x,
            y: prev.y + info.offset.y,
          }));
        }}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          x: position.x,
          y: position.y,
          zIndex: 9999,
          touchAction: 'none',
        }}
      >
        {/* Child buttons (radial) */}
        <AnimatePresence>
          {isOpen &&
            NAV_ITEMS.map((item, index) => {
              const count = NAV_ITEMS.length;
              const angle = baseAngle + (index - (count - 1) / 2) * SPREAD_ANGLE;
              const childX = Math.cos(angle) * RADIUS;
              const childY = Math.sin(angle) * RADIUS;
              const isActive = currentTab === item.id;

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  aria-label={item.id}
                  initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
                  animate={{
                    scale: 1,
                    x: childX,
                    y: childY,
                    opacity: 1,
                  }}
                  exit={{ scale: 0, x: 0, y: 0, opacity: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 22,
                    delay: index * 0.05,
                  }}
                  onClick={() => handleChildClick(item.id)}
                  style={{
                    position: 'absolute',
                    top: (FAB_SIZE - CHILD_SIZE) / 2,
                    left: (FAB_SIZE - CHILD_SIZE) / 2,
                    width: CHILD_SIZE,
                    height: CHILD_SIZE,
                    borderRadius: '50%',
                    border: 'none',
                    background: isActive ? '#c8ff00' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    cursor: 'pointer',
                    boxShadow: isActive
                      ? '0 0 0 3px #c8ff00, 0 4px 16px rgba(200,255,0,0.4)'
                      : '0 4px 16px rgba(0,0,0,0.25)',
                    padding: 0,
                  }}
                >
                  {item.icon}
                </motion.button>
              );
            })}
        </AnimatePresence>

        {/* Main FAB button */}
        <motion.button
          type="button"
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
          onClick={handleToggle}
          animate={{ rotate: isOpen ? 45 : 0 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: '50%',
            border: 'none',
            background: '#c8ff00',
            color: '#1a1f36',
            fontSize: 26,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(200,255,0,0.35), 0 2px 8px rgba(0,0,0,0.3)',
            position: 'relative',
            zIndex: 1,
            padding: 0,
          }}
        >
          {isOpen ? '✕' : '💉'}
        </motion.button>
      </motion.div>
    </>
  );
}
