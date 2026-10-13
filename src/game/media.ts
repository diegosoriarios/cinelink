import type { MediaType } from '../types/game';

export const mediaKey = (mediaType: MediaType, id: number): string => `${mediaType}:${id}`;
