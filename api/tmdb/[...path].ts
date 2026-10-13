import { handleTmdbRequest } from '../../server/tmdb-core';

export default {
  fetch(request: Request): Promise<Response> {
    return handleTmdbRequest(request);
  }
};
