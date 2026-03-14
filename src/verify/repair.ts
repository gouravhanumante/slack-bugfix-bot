import { runStep, formatFailureReport, getVerificationSteps, type VerifyResult } from "./runner";
import { runRepairAgent } from "../agent/agent";

type ProgressCallback = (message: string) => Promise<void>;

const MAX_REPAIR_ATTEMPTS = 2;

export interface PipelineResult {
  success: boolean;
  summary: string;
  allResults: VerifyResult[];
}

export async function runVerificationPipeline(
  workDir: string,
  bugId: number,
  bugTitle: string,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const steps = getVerificationSteps();
  const allResults: VerifyResult[] = [];

  for (const step of steps) {
    let passed = false;

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const label = attempt === 0
        ? `Running ${step.name}...`
        : `Repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS} for ${step.name}...`;

      if (onProgress) await onProgress(label);

      console.log(`  [verify] ${step.name} (attempt ${attempt})`);
      const result = await runStep(workDir, step);
      allResults.push(result);

      if (result.passed) {
        console.log(`  [verify] ${step.name} PASSED (${Math.round(result.durationMs / 1000)}s)`);
        if (onProgress) await onProgress(`${step.name} passed`);
        passed = true;
        break;
      }

      console.log(`  [verify] ${step.name} FAILED (exit ${result.exitCode}, ${Math.round(result.durationMs / 1000)}s)`);

      if (attempt === MAX_REPAIR_ATTEMPTS) {
        break;
      }

      const report = formatFailureReport([result]);

      if (onProgress) {
        await onProgress(`${step.name} failed — Cursor agent is repairing...`);
      }

      const repairResult = await runRepairAgent(workDir, bugId, bugTitle, step.name, report);
      console.log(`  [repair] success=${repairResult.success}, summary=${repairResult.summary.slice(0, 100)}`);

      if (!repairResult.success) {
        if (onProgress) {
          await onProgress(`Cursor agent could not repair ${step.name} failures`);
        }
        break;
      }
    }

    if (!passed) {
      const failedResults = allResults.filter((r) => !r.passed);
      const lastFailure = failedResults[failedResults.length - 1];
      return {
        success: false,
        summary: `${step.name} failed after ${MAX_REPAIR_ATTEMPTS} repair attempts.\n\nLast error:\n${lastFailure?.stderr?.slice(0, 500) || lastFailure?.stdout?.slice(0, 500) || "unknown"}`,
        allResults,
      };
    }
  }

  return {
    success: true,
    summary: "All verification steps passed",
    allResults,
  };
}
