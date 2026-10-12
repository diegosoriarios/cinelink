import type { ServerMessage } from '../types/race';
import { initialRaceState, reduceRaceMessage, useRaceStore } from './raceStore';

const person = (id: number, name: string) => ({ id, name, profile_path: null });

beforeEach(() => {
  useRaceStore.setState({ ...initialRaceState, selfId: 'me', nickname: 'Me' });
});

describe('reduceRaceMessage', () => {
  it('applies a roomState and merges start/target into the person map', () => {
    const next = reduceRaceMessage(initialRaceState, {
      type: 'roomState',
      state: {
        code: 'ABCD',
        phase: 'racing',
        players: [{ playerId: 'me', nickname: 'Me', isHost: true }],
        start: person(1, 'Start'),
        target: person(9, 'Target')
      }
    });

    expect(next.phase).toBe('racing');
    expect(next.code).toBe('ABCD');
    expect(next.startPerson?.name).toBe('Start');
    expect(next.targetPerson?.name).toBe('Target');
    expect(next.personMap?.[1]?.name).toBe('Start');
    expect(next.personMap?.[9]?.name).toBe('Target');
    expect(next.raceStartedAt).toEqual(expect.any(Number));
  });

  it('records the countdown deadline', () => {
    const next = reduceRaceMessage(initialRaceState, { type: 'countdown', endsAt: 12345 });
    expect(next.phase).toBe('countdown');
    expect(next.countdownEndsAt).toBe(12345);
  });

  it('ignores progress from self but tracks the opponent', () => {
    const base = {
      ...initialRaceState,
      selfId: 'me',
      players: [
        { playerId: 'me', nickname: 'Me', isHost: true },
        { playerId: 'you', nickname: 'You', isHost: false }
      ]
    };

    expect(reduceRaceMessage(base, { type: 'progress', playerId: 'me', hops: 5 })).toEqual({});
    expect(reduceRaceMessage(base, { type: 'progress', playerId: 'you', hops: 3 })).toEqual({
      opponentHops: 3,
      opponentName: 'You'
    });
  });

  it('captures the finished result', () => {
    const next = reduceRaceMessage(initialRaceState, {
      type: 'finished',
      winnerId: 'me',
      reason: 'claim',
      path: [1, 2, 9]
    });
    expect(next.phase).toBe('finished');
    expect(next.result).toEqual({ winnerId: 'me', reason: 'claim', path: [1, 2, 9] });
    expect(next.raceStartedAt).toBeNull();
  });

  it('maps known error codes to friendly messages', () => {
    expect(reduceRaceMessage(initialRaceState, { type: 'error', code: 'ROOM_FULL' }).message).toBe(
      'That room is already full.'
    );
    expect(reduceRaceMessage(initialRaceState, { type: 'error', code: 'WEIRD' }).message).toBe('Race error: WEIRD');
  });
});

describe('useRaceStore actions', () => {
  it('appends a hop and records the person name while racing', () => {
    useRaceStore.setState({ ...initialRaceState, selfId: 'me', phase: 'racing', path: [1] });

    const result = useRaceStore.getState().addHop(person(2, 'Second'), { id: 10, title: 'Shared Movie' });

    expect(result.ok).toBe(true);
    const state = useRaceStore.getState();
    expect(state.path).toEqual([1, 2]);
    expect(state.hops).toEqual([
      { fromPersonId: 1, toPersonId: 2, sharedMovieId: 10, sharedMovieTitle: 'Shared Movie' }
    ]);
    expect(state.personMap[2]?.name).toBe('Second');
  });

  it('refuses hops outside of the racing phase', () => {
    useRaceStore.setState({ ...initialRaceState, selfId: 'me', phase: 'lobby', path: [1] });
    const result = useRaceStore.getState().addHop(person(2, 'Second'), { id: 10, title: 'Shared Movie' });
    expect(result.ok).toBe(false);
    expect(useRaceStore.getState().path).toEqual([1]);
  });

  it('reverts the last hop on undo', () => {
    useRaceStore.setState({
      ...initialRaceState,
      selfId: 'me',
      phase: 'racing',
      path: [1, 2],
      hops: [{ fromPersonId: 1, toPersonId: 2, sharedMovieId: 10, sharedMovieTitle: 'Shared Movie' }]
    });

    useRaceStore.getState().undoHop();

    expect(useRaceStore.getState().path).toEqual([1]);
    expect(useRaceStore.getState().hops).toEqual([]);
  });

  it('routes server messages through the reducer', () => {
    const message: ServerMessage = {
      type: 'roomState',
      state: { code: 'ZZZZ', phase: 'lobby', players: [{ playerId: 'me', nickname: 'Me', isHost: true }] }
    };

    useRaceStore.getState().handleMessage(message);

    expect(useRaceStore.getState().code).toBe('ZZZZ');
    expect(useRaceStore.getState().players).toHaveLength(1);
  });

  it('resets transient state on rematch', () => {
    useRaceStore.setState({
      ...initialRaceState,
      selfId: 'me',
      phase: 'finished',
      path: [1, 2],
      hops: [{ fromPersonId: 1, toPersonId: 2, sharedMovieId: 10, sharedMovieTitle: 'Shared Movie' }],
      result: { winnerId: 'me', reason: 'claim', path: [1, 2] }
    });

    useRaceStore.getState().rematch();

    const state = useRaceStore.getState();
    expect(state.phase).toBe('lobby');
    expect(state.path).toEqual([]);
    expect(state.hops).toEqual([]);
    expect(state.result).toBeNull();
  });
});
