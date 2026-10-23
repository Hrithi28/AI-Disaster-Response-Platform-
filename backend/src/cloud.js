// Starts a "state HQ" cloud node that receives store-and-forward sync from
// control-room edge nodes. Usage: npm run cloud   (port 4200)
process.env.PORT ||= '4200';
process.env.NODE_ROLE = 'cloud';
process.env.NODE_ID ||= 'tn-state-hq';
process.env.SIM_ENABLED = 'false';
process.env.WEATHER_ENABLED ||= 'false';
const { start, installShutdown } = await import('./server.js');
installShutdown(await start());
