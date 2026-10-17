"use client";

import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

export type Phase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export const PHASE_COLOR: Record<Phase, string> = {
  idle: "#a78bfa",
  listening: "#22d3ee",
  transcribing: "#22d3ee",
  thinking: "#fbbf24",
  speaking: "#f472b6",
};

interface Props {
  phase: Phase;
  /** 0..1, polled every frame: mic level while listening, voice level while speaking. */
  getLevel: () => number;
  size?: number;
}

export function Character({ phase, getLevel, size = 260 }: Props) {
  const color = PHASE_COLOR[phase];
  const level = useMotionValue(0);
  const smooth = useSpring(level, { stiffness: 600, damping: 30 });

  // Gaze follows the pointer, or looks up while thinking.
  const gazeX = useSpring(0, { stiffness: 120, damping: 15 });
  const gazeY = useSpring(0, { stiffness: 120, damping: 15 });
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (phase === "thinking" || !svgRef.current) return;
      const r = svgRef.current.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      gazeX.set(Math.max(-1, Math.min(1, dx * 2.5)) * 4.5);
      gazeY.set(Math.max(-1, Math.min(1, dy * 2.5)) * 4.5);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [phase, gazeX, gazeY]);
  useEffect(() => {
    if (phase === "thinking") {
      gazeX.set(-4);
      gazeY.set(-5);
    }
  }, [phase, gazeX, gazeY]);

  useAnimationFrame(() => {
    level.set(phase === "speaking" || phase === "listening" ? getLevel() : 0);
  });

  // Blink every few seconds.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 140);
          loop();
        },
        2500 + Math.random() * 3000,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  const open = useTransform(smooth, (l) =>
    phase === "speaking" ? 3 + l * 22 : 0,
  );
  const smile = phase === "thinking" ? 2 : phase === "listening" ? 6 : 9;
  const mouth = useTransform(open, (o) => {
    const top = 128 - o * 0.25;
    const bottom = 128 + smile + o;
    return `M84 ${top} Q100 ${top + 4 - o * 0.2} 116 ${top} Q100 ${bottom} 84 ${top} Z`;
  });
  const glowScale = useTransform(smooth, (l) => 1 + l * 0.25);
  const bodyScale = useTransform(smooth, (l) => 1 + l * 0.04);
  const pupilX = useTransform(gazeX, (x) => x);
  const pupilY = useTransform(gazeY, (y) => y);

  const eyeRy = blink ? 1 : phase === "listening" ? 15 : 13;

  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      {/* aura */}
      <motion.div
        className="absolute inset-[-30%] rounded-full blur-3xl"
        style={{ scale: glowScale }}
        animate={{
          backgroundColor: color,
          opacity: phase === "idle" ? 0.22 : 0.38,
        }}
        transition={{ duration: 0.6 }}
      />

      {/* listening ripples */}
      <AnimatePresence>
        {phase === "listening" &&
          [0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-[8%] rounded-full border-2"
              style={{ borderColor: color }}
              initial={{ scale: 0.9, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: i * 0.6,
                ease: "easeOut",
              }}
            />
          ))}
      </AnimatePresence>

      <motion.svg
        ref={svgRef}
        viewBox="0 0 200 200"
        className="relative h-full w-full overflow-visible drop-shadow-2xl"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="body" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#f5f3ff" />
            <stop offset="35%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#6d28d9" />
          </radialGradient>
          <linearGradient id="leaf" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>

        {/* sprout antenna */}
        <motion.g
          style={{ originX: "100px", originY: "40px" }}
          animate={{
            rotate: phase === "thinking" ? [-12, 12, -12] : [-4, 4, -4],
          }}
          transition={{
            duration: phase === "thinking" ? 0.9 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <path
            d="M100 40 C100 30 101 24 103 18"
            stroke="#4ade80"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M103 18 C112 8 126 10 128 14 C122 22 110 24 103 18 Z"
            fill="url(#leaf)"
          />
          <path
            d="M102 24 C94 16 82 18 81 22 C87 28 97 28 102 24 Z"
            fill="url(#leaf)"
            opacity="0.85"
          />
        </motion.g>

        {/* body */}
        <motion.g
          style={{ scale: bodyScale, originX: "100px", originY: "110px" }}
        >
          <ellipse cx="100" cy="110" rx="72" ry="70" fill="url(#body)" />
          <ellipse
            cx="78"
            cy="72"
            rx="22"
            ry="12"
            fill="white"
            opacity="0.35"
            transform="rotate(-25 78 72)"
          />

          {/* eyes */}
          {[76, 124].map((cx) => (
            <g key={cx}>
              <motion.ellipse
                cx={cx}
                cy={100}
                rx={11}
                animate={{ ry: eyeRy }}
                transition={{ duration: 0.08 }}
                fill="white"
              />
              {!blink && (
                <motion.g style={{ x: pupilX, y: pupilY }}>
                  <circle cx={cx} cy={101} r={6.5} fill="#1e1b4b" />
                  <circle cx={cx + 2.2} cy={98} r={2} fill="white" />
                </motion.g>
              )}
            </g>
          ))}

          {/* cheeks */}
          <ellipse
            cx="60"
            cy="122"
            rx="9"
            ry="5"
            fill="#f472b6"
            opacity="0.45"
          />
          <ellipse
            cx="140"
            cy="122"
            rx="9"
            ry="5"
            fill="#f472b6"
            opacity="0.45"
          />

          {/* mouth */}
          <motion.path
            d={mouth}
            fill="#3b0764"
            stroke="#3b0764"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </motion.g>

        {/* thinking dots */}
        <AnimatePresence>
          {(phase === "thinking" || phase === "transcribing") && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              style={{ originX: "100px", originY: "110px" }}
              transition={{
                rotate: { duration: 2.4, repeat: Infinity, ease: "linear" },
              }}
            >
              {[0, 120, 240].map((deg) => (
                <circle
                  key={deg}
                  cx={100 + 92 * Math.cos((deg * Math.PI) / 180)}
                  cy={110 + 92 * Math.sin((deg * Math.PI) / 180)}
                  r="5"
                  fill={color}
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>
    </div>
  );
}
