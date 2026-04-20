import { loadEdgeAgentConfig } from './config';
import { EdgeAgent } from './agent';

type Command = 'run' | 'claim' | 'doctor' | 'simulate-event';

function readFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = (['run', 'claim', 'doctor', 'simulate-event'].includes(args[0]) ? args[0] : 'run') as Command;
  const configPath = readFlagValue(args, '--config');
  const force = args.includes('--force');
  const deviceRef = readFlagValue(args, '--device-ref');
  const userId = readFlagValue(args, '--user-id');
  const method = readFlagValue(args, '--method');
  const direction = readFlagValue(args, '--direction') === 'exit' ? 'exit' as const : 'entry' as const;
  const status = readFlagValue(args, '--status') === 'denied' ? 'denied' as const : 'granted' as const;
  return { command, configPath, force, deviceRef, userId, method, direction, status };
}

async function main() {
  const { command, configPath, force, deviceRef, userId, method, direction, status } = parseArgs();
  const { config, configPath: resolvedConfigPath } = await loadEdgeAgentConfig(configPath);
  const agent = new EdgeAgent(config);

  if (command === 'doctor') {
    await agent.init();
    const health = await agent.getHealthSnapshot();
    console.log('\n[EdgeAgent] Doctor');
    console.log(`Config: ${resolvedConfigPath}`);
    console.log(`Cloud: ${config.cloud.baseUrl}`);
    console.log(`Local server: ${config.localServer.host || '0.0.0.0'}:${config.localServer.port}`);
    console.log(`Managed devices: ${config.devices.length}`);
    console.log(`AutoRegister devices: ${health.autoRegister?.enabledDevices || 0}`);
    console.log(`Claimed: ${health.claimed ? 'yes' : 'no'}`);
    return;
  }

  if (command === 'claim') {
    const credentials = await agent.claim(force);
    console.log('\n[EdgeAgent] Claim complete');
    console.log(`Edge ID: ${credentials.edgeId}`);
    console.log(`Connector: ${credentials.connectorName}`);
    console.log(`State saved to: ${config.stateDir}`);
    return;
  }

  if (command === 'simulate-event') {
    await agent.init();
    const result = await agent.simulateTestEvent({
      deviceRef,
      userId,
      method,
      direction,
      status,
    });
    console.log('\n[EdgeAgent] Test event queued');
    console.log(`Config: ${resolvedConfigPath}`);
    console.log(`Device ref: ${result.deviceRef}`);
    console.log(`UserID: ${result.userIdRaw}`);
    console.log(`Occurred at: ${result.occurredAt}`);
    console.log(`Spool size: ${result.spoolSize}`);
    return;
  }

  await agent.run();
  console.log('\n[EdgeAgent] Running');
  console.log(`Cloud: ${config.cloud.baseUrl}`);
  console.log(`Local server: ${config.localServer.host || '0.0.0.0'}:${config.localServer.port}`);
  console.log(`Operations UI: http://${config.localServer.host || '127.0.0.1'}:${config.localServer.port}/ui`);
  console.log(`AutoRegister endpoint: http://${config.localServer.host || '127.0.0.1'}:${config.localServer.port}/cgi-bin/api/autoRegist/connect`);
  console.log(`Devices: ${config.devices.length}`);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      console.log('\n[EdgeAgent] Stopping...');
      await agent.stop();
      resolve();
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

main().catch((err) => {
  console.error('[EdgeAgent] Fatal:', err.message);
  process.exitCode = 1;
});
