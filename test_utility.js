async function run() {
  // Try to find a valid agentUid from getLanSites
  const res = await fetch('https://app.quanlymay.com/api/lan-sites?lead=default');
  const json = await res.json();
  const agent = json.rows[0]?.agents[0];
  if (!agent) return console.log('No agent found');
  
  const cmdRes = await fetch(`https://app.quanlymay.com/api/agents/${agent.agent_uid}/utility-commands?lead=default`);
  const cmds = await cmdRes.json();
  console.log(JSON.stringify(cmds, null, 2));
}
run();
