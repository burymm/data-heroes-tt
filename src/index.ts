import express from 'express';
import { sql, pingDb } from './infra/db.js';
import { logger } from './infra/logger.js';
import { PreferenceRepository } from './infra/repositories/preference-repository.js';
import { PolicyRepository } from './infra/repositories/policy-repository.js';
import { PreferenceService } from './app/preference-service.js';
import { EvaluationService } from './app/evaluation-service.js';
import { createRouter } from './api/routes.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main(): Promise<void> {
  await pingDb();

  const prefRepo = new PreferenceRepository(sql);
  const policyRepo = new PolicyRepository(sql);
  const prefService = new PreferenceService(prefRepo);
  const evalService = new EvaluationService(prefRepo, policyRepo);

  const app = express();
  app.use(express.json());
  app.use(createRouter(prefService, evalService));

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server started');
  });
}

main().catch((err) => {
  logger.fatal(err, 'failed to start server');
  process.exit(1);
});
