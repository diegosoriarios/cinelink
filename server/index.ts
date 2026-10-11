import { createApp } from './app';

const port = Number(process.env.PORT ?? 8787);

const { server } = createApp();
server.listen(port, '0.0.0.0', () => {
  console.log(`CineLink server listening on :${port}`);
});
