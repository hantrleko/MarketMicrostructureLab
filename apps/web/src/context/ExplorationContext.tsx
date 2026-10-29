import React, { createContext, useContext, useState } from 'react';

export type UserMode = 'guided' | 'expert';

interface ExplorationContextType {
  userMode: UserMode;
  setUserMode: (mode: UserMode) => void;
  isTourActive: boolean;
  tourStep: number;
  startTour: () => void;
  endTour: () => void;
  setTourStep: (step: number) => void;
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

  return (
    <ExplorationContext.Provider
      value={{
        userMode,
        setUserMode,
        isTourActive,
        tourStep,
        startTour,
        endTour,
        setTourStep
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
