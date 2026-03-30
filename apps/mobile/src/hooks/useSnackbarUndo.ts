import { useCallback, useEffect, useRef, useState } from 'react';

type SnackbarUndoState<T> = {
  visible: boolean;
  payload: T | null;
};

type SnackbarUndoOptions<T> = {
  timeoutMs?: number;
  onUndo: (payload: T) => void;
};

const DEFAULT_TIMEOUT_MS = 5000;

export function useSnackbarUndo<T>({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onUndo,
}: SnackbarUndoOptions<T>) {
  const [state, setState] = useState<SnackbarUndoState<T>>({ visible: false, payload: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setState({ visible: false, payload: null });
  }, [clearTimer]);

  const showUndo = useCallback(
    (payload: T) => {
      clearTimer();
      setState({ visible: true, payload });
      timerRef.current = setTimeout(() => {
        setState({ visible: false, payload: null });
        timerRef.current = null;
      }, timeoutMs);
    },
    [clearTimer, timeoutMs],
  );

  const handleUndo = useCallback(() => {
    if (!state.payload) return;
    onUndo(state.payload);
    dismiss();
  }, [dismiss, onUndo, state.payload]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    visible: state.visible,
    payload: state.payload,
    showUndo,
    onUndoAction: handleUndo,
    onDismiss: dismiss,
  };
}
