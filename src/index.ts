import { buildApp } from './app';
import { env } from './config/env';

const start = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${env.PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
