import { randomInt } from 'node:crypto';
import pool from '../src/data/tmdbPool.json';

export type PoolPerson = {
  id: number;
  name: string;
  kind: string;
};

export type RacePerson = {
  id: number;
  name: string;
  profile_path: string | null;
};

const PEOPLE = pool as PoolPerson[];

export const poolSize = PEOPLE.length;

export const getPool = (): PoolPerson[] => PEOPLE;

export const getPerson = (id: number): PoolPerson | undefined => PEOPLE.find((person) => person.id === id);

const toRacePerson = (person: PoolPerson): RacePerson => ({
  id: person.id,
  name: person.name,
  profile_path: null
});

export const dealPair = (random = randomInt): { start: RacePerson; target: RacePerson } => {
  if (PEOPLE.length < 2) {
    throw new Error('tmdbPool.json needs at least two people to deal a race');
  }
  const startIndex = random(PEOPLE.length);
  let targetIndex = random(PEOPLE.length - 1);
  if (targetIndex >= startIndex) {
    targetIndex += 1;
  }
  return {
    start: toRacePerson(PEOPLE[startIndex]),
    target: toRacePerson(PEOPLE[targetIndex])
  };
};
