import { spawnSync } from 'node:child_process';
const run = args => {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/simulate-campaign.ts', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['final-practiced', 'balanced,offense,fortress,mobility,second-base,defense-only,expedition-only', '17,41,89,123,2026']);
run(['final-casual', 'balanced,offense,fortress,mobility', '17,41,89,123,2026', 'casual']);
for (const omit of ['attack','speed','range','health','move','soldiers','training','wall','tower','cannon','healer','storage','forge','base','weapon','armor','charm','skill']) run([`omit-${omit}`, 'balanced', '17,41,89', 'casual', omit]);
const report = spawnSync(process.execPath, ['scripts/report-balance.mjs'], { stdio: 'inherit' });
process.exit(report.status ?? 1);
