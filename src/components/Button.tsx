// Adapted from beUI's Button: https://beui.dev/components/motion/button
// MIT © 2026 Saurabh Chauhan. See THIRD_PARTY_NOTICES.md.
// Uses Sotto's CSS variants and retains beUI's spring press / hover behavior.
import { forwardRef, useEffect, useState } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

export const Button = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(
  function Button({ className = "", disabled, ...props }, ref) {
    const reduce = useReducedMotion();
    const [canHover, setCanHover] = useState(false);
    useEffect(() => {
      const query = window.matchMedia("(hover: hover) and (pointer: fine)");
      const update = () => setCanHover(query.matches);
      update();
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }, []);
    return (
      <motion.button
        ref={ref}
        type="button"
        disabled={disabled}
        whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
        whileHover={
          reduce || disabled || !canHover ? undefined : { scale: 1.02 }
        }
        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.6 }}
        className={`button ${className}`}
        {...props}
      />
    );
  },
);
