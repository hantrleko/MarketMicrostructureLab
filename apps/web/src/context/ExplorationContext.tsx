import React, { createContext, useContext, useState } from 'react';

export type UserMode = 'guided' | 'expert';

const BADGES_STORAGE_KEY = 'mml_quiz_unlocked_badges';

interface ExplorationContextType {
  userMode: UserMode;
  setUserMode: (mode: UserMode) => void;
  isTourActive: boolean;
  tourStep: number;
  startTour: () => void;
  endTour: () => void;
  setTourStep: (step: number) => void;
  unlockedBadges: Record<number, boolean>;
  unlockBadge: (act: number) => void;
  isHonorWallOpen: boolean;
  setIsHonorWallOpen: (open: boolean) => void;
}

const ExplorationContext = createContext<ExplorationContextType | undefined>(undefined);

export const ExplorationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userMode, setUserModeState] = useState<UserMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mml_user_mode');
      if (saved === 'expert' || saved === 'guided') return saved;
    }
    return 'guided'; // Default to guided newcomer mode
  });

  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(1);
  const [isHonorWallOpen, setIsHonorWallOpen] = useState<boolean>(false);

  const [unlockedBadges, setUnlockedBadges] = useState<Record<number, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(BADGES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const setUserMode = (mode: UserMode) => {
    setUserModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mml_user_mode', mode);
    }
  };

  const startTour = () => {
    setUserMode('guided');
    setTourStep(1);
    setIsTourActive(true);
  };

  const endTour = () => {
    setIsTourActive(false);
  };

  const unlockBadge = (act: number) => {
    setUnlockedBadges((prev) => {
      const next = { ...prev, [act]: true };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  return (
    <ExplorationContext.Provider
      value={{
        userMode,
        setUserMode,
        isTourActive,
        tourStep,
        startTour,
        endTour,
        setTourStep,
        unlockedBadges,
        unlockBadge,
        isHonorWallOpen,
        setIsHonorWallOpen
      }}
    >
      {children}
    </ExplorationContext.Provider>
  );
};

export function useExploration() {
  const context = useContext(ExplorationContext);
  if (!context) {
    throw new Error('useExploration must be used within an ExplorationProvider');
  }
  return context;
}
