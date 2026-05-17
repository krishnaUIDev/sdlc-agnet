import { NextResponse } from 'next/server';
import { runJarvis } from '@/agents/jarvis';
import { runScrumMaster } from '@/agents/scrum_master';
import { runHelpAgent } from '@/agents/help';
import { runUxAgent } from '@/agents/ux';
import { runDevAgent } from '@/agents/dev';
import { runSeoAgent } from '@/agents/seo';
import { runQaAgent } from '@/agents/qa';
import { runSecurityAgent } from '@/agents/security';
import { runReviewAgent } from '@/agents/review';
import { runDevopsAgent } from '@/agents/devops';

export async function POST() {
  runPipeline().catch(console.error);
  return NextResponse.json({ success: true, message: "Agent Pipeline Triggered" });
}

async function runPipeline() {
  console.log("=== API TRIGGERED: Autonomous Pipeline Started ===");
  
  await runJarvis();
  await runScrumMaster();
  
  for (let i = 0; i < 7; i++) {
    await runHelpAgent(); // Unblocks anyone stuck before running the workers!
    await runUxAgent();
    await runDevAgent();
    await runSeoAgent();
    await runQaAgent();
    await runSecurityAgent();
    await runReviewAgent();
    await runDevopsAgent();
  }
  
  console.log("=== API TRIGGERED: Autonomous Pipeline Finished ===");
}
