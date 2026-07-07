// FloatingNav — Draggable radial FAB replacing tab bar navigation.
//
// A floating action button that expands child navigation items in a
// radial/fan pattern, smartly choosing expansion direction based on
// which quadrant of the viewport it currently occupies.

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Calculator, PenLine, BarChart3, TrendingUp, Settings } from 'lucide-react';

/** Tab type must match the one defined in App.tsx */
type Tab = 'calculator' | 'record' | 'history' | 'metrics' | 'profile';

export interface FloatingNavProps {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface NavItem {
  id: Tab;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'calculator', icon: <Calculator size={22} /> },
  { id: 'record', icon: <PenLine size={22} /> },
  { id: 'history', icon: <BarChart3 size={22} /> },
  { id: 'metrics', icon: <TrendingUp size={22} /> },
  { id: 'profile', icon: <Settings size={22} /> },
];

const SPACING = 60; // distance between children (vertical line)
const RADIUS = 85; // radius for circular layout (middle zone)
const SPREAD_ANGLE = 0.6;
const FAB_SIZE = 60;
const CHILD_SIZE = 48;

/**
 * Determine layout mode based on FAB vertical position:
 * - bottom third → children go UP in a vertical line
 * - top third → children go DOWN in a vertical line
 * - middle → children fan out in a circle around the FAB
 */
type LayoutMode = 'up' | 'down' | 'around';

function getLayoutMode(fabCenterY: number, viewportH: number): LayoutMode {
  const third = viewportH / 3;
  if (fabCenterY > viewportH - third) return 'up';
  if (fabCenterY < third) return 'down';
  return 'around';
}

/**
 * Get the x,y offset for a child button based on layout mode.
 */
function getChildPosition(
  index: number,
  count: number,
  mode: LayoutMode,
  fabCenterX: number,
  fabCenterY: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  if (mode === 'up') {
    // Vertical line going up
    return { x: 0, y: -(index + 1) * SPACING };
  }
  if (mode === 'down') {
    // Vertical line going down
    return { x: 0, y: (index + 1) * SPACING };
  }
  // 'around' — circular layout pointing toward center
  const centerX = viewportW / 2;
  const centerY = viewportH / 2;
  const baseAngle = Math.atan2(centerY - fabCenterY, centerX - fabCenterX);
  const angle = baseAngle + (index - (count - 1) / 2) * SPREAD_ANGLE;
  return {
    x: Math.cos(angle) * RADIUS,
    y: Math.sin(angle) * RADIUS,
  };
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

  const layoutMode = getLayoutMode(fabCenterY, viewport.h);

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
        {/* Child buttons */}
        <AnimatePresence>
          {isOpen &&
            NAV_ITEMS.map((item, index) => {
              const count = NAV_ITEMS.length;
              const { x: childX, y: childY } = getChildPosition(
                index,
                count,
                layoutMode,
                fabCenterX,
                fabCenterY,
                viewport.w,
                viewport.h,
              );
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
                    cursor: 'pointer',
                    color: isActive ? '#1a1f36' : '#1a1f36',
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
          {isOpen ? <X size={26} /> : <Menu size={26} />}
        </motion.button>
      </motion.div>
    </>
  );
}
