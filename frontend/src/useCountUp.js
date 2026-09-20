import { useEffect, useState, useRef } from "react";

// Animates a number counting up from its previous value to `value`
// over `duration` ms. Use it in place of rendering the raw number directly.
export function useCountUp(value, duration = 500) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const frameRef = useRef();

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    if (start === end) return;

    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevValue.current = end;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return display;
}
