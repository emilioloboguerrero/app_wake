import React, { createContext, useContext, useCallback, useState, useRef } from 'react';

const BackgroundTaskContext = createContext(null);

const STATUS = { RUNNING: 'running', DONE: 'done', ERROR: 'error' };
let nextId = 1;

export function BackgroundTaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const dismissTimersRef = useRef(new Map());

  const removeTask = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const timer = dismissTimersRef.current.get(id);
    if (timer) { clearTimeout(timer); dismissTimersRef.current.delete(id); }
  }, []);

  const scheduleDismiss = useCallback((id, ms) => {
    const timer = setTimeout(() => removeTask(id), ms);
    dismissTimersRef.current.set(id, timer);
  }, [removeTask]);

  // addTask({ label }) → { succeed(doneLabel?), fail(errorLabel?) }
  const addTask = useCallback(({ label }) => {
    const id = nextId++;
    setTasks((prev) => [...prev, { id, label, status: STATUS.RUNNING, createdAt: Date.now() }]);
    return {
      id,
      succeed: (doneLabel) => {
        setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: STATUS.DONE, label: doneLabel ?? t.label } : t));
        scheduleDismiss(id, 3500);
      },
      fail: (errorLabel) => {
        setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: STATUS.ERROR, label: errorLabel ?? `Error: ${t.label}` } : t));
        scheduleDismiss(id, 6000);
      },
    };
  }, [scheduleDismiss]);

  const value = { tasks, addTask, removeTask, STATUS };
  return <BackgroundTaskContext.Provider value={value}>{children}</BackgroundTaskContext.Provider>;
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTaskContext);
  if (!ctx) throw new Error('useBackgroundTasks must be used inside BackgroundTaskProvider');
  return ctx;
}
