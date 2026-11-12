import { useCallback, useEffect, useState } from 'react';
import type { Tournament } from '../model/types';
import { loadTournament, saveTournament } from '../storage/db';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; tournament: Tournament; dirty: boolean };

/** Загружает турнир и сохраняет каждое изменение в хранилище. */
export function useTournament(id: string | undefined) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    if (!id) {
      setState({ status: 'missing' });
      return;
    }
    void loadTournament(id).then((t) => {
      if (!cancelled) setState(t ? { status: 'ready', tournament: t, dirty: false } : { status: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Сохранение — отдельным эффектом: функция изменения может вызываться React повторно
  // (например, жеребьёвка со случайными числами), а записать нужно именно показанное состояние.
  useEffect(() => {
    if (state.status === 'ready' && state.dirty) void saveTournament(state.tournament);
  }, [state]);

  const update = useCallback((change: (t: Tournament) => Tournament) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const tournament = { ...change(prev.tournament), updatedAt: new Date().toISOString() };
      return { status: 'ready', tournament, dirty: true };
    });
  }, []);

  return { state, update };
}
