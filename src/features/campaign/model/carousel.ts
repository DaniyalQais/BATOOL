export const ROTATION_MS = 7000;
export interface CarouselState {
  readonly active: number;
  readonly pending: number | null;
  readonly loaded: readonly number[];
  readonly paused: boolean;
  readonly initialized: boolean;
  readonly error: boolean;
}
export const initialCarouselState: CarouselState = {
  active: 0, pending: 0, loaded: [], paused: true, initialized: false, error: false,
};
export type CarouselAction =
  | { type: "initialize"; reducedMotion: boolean }
  | { type: "pause" }
  | { type: "play" }
  | { type: "request"; index: number; manual: boolean; count: number }
  | { type: "ready"; index: number }
  | { type: "failed"; index: number };

export function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  switch (action.type) {
    case "initialize":
      return state.initialized ? state : { ...state, initialized: true, paused: action.reducedMotion };
    case "pause": return { ...state, paused: true, pending: null };
    case "play": return { ...state, paused: false };
    case "request": {
      if (action.count < 1 || !Number.isInteger(action.index)) return state;
      if (!action.manual && state.paused) return state;
      const index = ((action.index % action.count) + action.count) % action.count;
      const ready = state.loaded.includes(index);
      return {
        ...state, active: ready ? index : state.active,
        pending: ready ? null : index,
        error: false,
      };
    }
    case "ready": {
      const loaded = state.loaded.includes(action.index) ? state.loaded : [...state.loaded, action.index];
      // A slow earlier image must not override a more recent navigation request.
      return { ...state, loaded, ...(state.pending === action.index ? { active: action.index, pending: null } : {}) };
    }
    case "failed":
      return action.index === state.pending
        ? { ...state, pending: null, paused: true, error: true }
        : state;
  }
}
export interface RotationConditions {
  readonly pageVisible: boolean;
  readonly inView: boolean;
}
export function canRotate(state: CarouselState, conditions: RotationConditions): boolean {
  return state.initialized && !state.paused && !state.error && state.pending === null &&
    state.loaded.includes(state.active) &&
    conditions.pageVisible && conditions.inView;
}
