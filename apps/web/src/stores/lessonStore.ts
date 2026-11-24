"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Where the learner is in the open lesson. stepIndex -1 is the activity intro; steps.length is its summary. */
export interface ActiveLesson {
  slug: string;
  activityIndex: number;
  stepIndex: number;
}

interface LessonStoreState {
  active: ActiveLesson | null;
  minimized: boolean;
  /** Where the learner dragged the panel, as distances from the workspace's bottom-right corner. */
  panelOffset: { right: number; bottom: number };
  /** Activity ids the learner finished. */
  completedActivities: Record<string, true>;
}

interface LessonStoreActions {
  startLesson: (slug: string) => void;
  endLesson: () => void;
  goTo: (activityIndex: number, stepIndex: number) => void;
  completeActivity: (activityId: string) => void;
  setMinimized: (minimized: boolean) => void;
  setPanelOffset: (offset: { right: number; bottom: number }) => void;
}

export const useLessonStore = create<LessonStoreState & LessonStoreActions>()(
  persist(
    (set) => ({
      active: null,
      minimized: false,
      panelOffset: { right: 16, bottom: 16 },
      completedActivities: {},
      startLesson: (slug) => set({ active: { slug, activityIndex: 0, stepIndex: -1 }, minimized: false }),
      endLesson: () => set({ active: null }),
      goTo: (activityIndex, stepIndex) =>
        set((state) => (state.active ? { active: { ...state.active, activityIndex, stepIndex } } : state)),
      completeActivity: (activityId) =>
        set((state) => ({ completedActivities: { ...state.completedActivities, [activityId]: true } })),
      setMinimized: (minimized) => set({ minimized }),
      setPanelOffset: (panelOffset) => set({ panelOffset }),
    }),
    {
      name: "edtech:lesson-progress",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
