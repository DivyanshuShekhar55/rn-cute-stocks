/**
 * global defaults  
 * these defaults are shared by one or more chart types
**/

import { LinearAnimationConfig, SpringAnimationConfig } from "./types";

// Defaults
export const DEFAULT_SPRING_CONFIG: Required<SpringAnimationConfig> = {
  mass: 1,
  damping: 5,
  stiffness: 150,
};

export const DEFAULT_LINEAR_CONFIG: Required<LinearAnimationConfig> = {
  duration: 300,
};
