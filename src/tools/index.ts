import { getSuuntoTokenTool } from './get-suunto-token';
import { getStepsTool } from './get-steps';
import { listWorkoutsV3Tool } from './list-workouts-v3';
import { getWorkoutV3Tool } from './get-workout-v3';
import { exportWorkoutFitTool } from './export-workout-fit';
import { getDailyActivityStatistics247Tool } from './get-daily-activity-statistics-247';
import { getDailyActivitySamples247Tool } from './get-daily-activity-samples-247';
import { getSleepData247Tool } from './get-sleep-data-247';
import { getRecoveryData247Tool } from './get-recovery-data-247';

export const toolRegistry: Record<string, Function> = {};

export function registerAllTools(server: any) {
  console.log('registerAllTools called');
  getSuuntoTokenTool(server, toolRegistry);
  getStepsTool(server, toolRegistry);
  listWorkoutsV3Tool(server, toolRegistry);
  getWorkoutV3Tool(server, toolRegistry);
  exportWorkoutFitTool(server, toolRegistry);
  getDailyActivityStatistics247Tool(server, toolRegistry);
  getDailyActivitySamples247Tool(server, toolRegistry);
  getSleepData247Tool(server, toolRegistry);
  getRecoveryData247Tool(server, toolRegistry);
  console.log('All tools registration attempted');
}
