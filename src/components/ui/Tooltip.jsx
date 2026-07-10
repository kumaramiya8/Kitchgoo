import React, { useState, useRef, useCallback, useId } from 'react';
import ReactDOM from 'react-dom';

/**
 * Lightweight animated tooltip — the Animate UI tooltip feel (spring pop-in)
 * implemented in the app's own CSS/JS stack instead of Framer + Radix.
 *
 * Usage:
 *   <Tooltip label="Kitchen Display" side="bottom">
 *     <button className="header-icon-btn"><Monitor /></button>
 *   </Tooltip>
 *
 * Wraps a single interactive child; shows on hover and keyboard focus, hides
 * on leave/blur/scroll. Positioned in a portal so it's never clipped by an
 * overflow:hidden ancestor. Honors openDelay/closeDelay like the reference.
 */
const Tooltip = ({
  label,
  children,
  side = 'top',
  sideOffset = 8,
  openDelay = 150,
  closeDelay = 80,
  disabled = false,
}) => {
  const [pos, setPos] = useState(null); // { x, y, side } or null
  const anchorRef = useRef(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const tipId = useId();

  const clearTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };

  const compute = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    switch (side) {
      case 'bottom': return { x: cx, y: r.bottom + sideOffset, side };
      case 'left':   return { x: r.left - sideOffset, y: cy, side };
      case 'right':  return { x: r.right + sideOffset, y: cy, side };
      default:       return { x: cx, y: r.top - sideOffset, side }; // top
    }
  }, [side, sideOffset]);

  const open = () => {
    if (disabled || !label) return;
    clearTimers();
    openTimer.current = setTimeout(() => setPos(compute()), openDelay);
  };
  const close = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setPos(null), closeDelay);
  };

  // Translate so the bubble sits on the correct side and stays centered
  const transform = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  }[side];
  const origin = {
    top: 'bottom center',
    bottom: 'top center',
    left: 'center right',
    right: 'center left',
  }[side];

  const bubble = pos ? ReactDOM.createPortal(
    <div
      role="tooltip"
      id={tipId}
      className="tt-bubble"
      data-side={pos.side}
      style={{ left: pos.x, top: pos.y, transform, '--tt-origin': origin }}
    >
      {label}
    </div>,
    document.body
  ) : null;

  // Wrap the child in a tight inline span that carries the anchor + hover/
  // focus handlers, so the child keeps its own ref (e.g. a dropdown anchor)
  // untouched. focus/blur bubble up via focusin/focusout (React onFocus/onBlur).
  return (
    <>
      <span
        ref={anchorRef}
        className="tt-wrap"
        aria-describedby={pos ? tipId : undefined}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => close()}
      >
        {children}
      </span>
      {bubble}
    </>
  );
};

export default Tooltip;
