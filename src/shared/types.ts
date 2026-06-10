/**
 * these are types shared by one or more charts
**/

export type AnimationType = "spring" | "linear" | "none";

export interface SpringAnimationConfig {
  mass?: number;
  damping?: number;
  stiffness?: number;
}

export interface LinearAnimationConfig {
  duration?: number;
}

export type AnimationConfig = SpringAnimationConfig | LinearAnimationConfig;
