import "dotenv/config";
const T = process.env.CLICKUP_API_TOKEN;
const SPACE = process.env.CLICKUP_SPACE_OPTIMISATION;
const h = { Authorization: T };
const j = async (u) => (await fetch(u, { headers: h })).json();
async function allTasks(listId, subtasks) {
  const out = [];
  for (let p = 0; p < 50; p++) {
    const u = `https://api.clickup.com/api/v2/list/${listId}/task?page=${p}&include_closed=true${subtasks?"&subtasks=true":""}`;
    const d = await j(u);
    const b = d.tasks ?? [];
    out.push(...b);
    if (d.last_page || b.length === 0) break;
  }
  return out;
}
const folders = (await j(`https://api.clickup.com/api/v2/space/${SPACE}/folder?archived=false`)).folders ?? [];
for (const subtasks of [false, true]) {
  let complete = 0, pending = 0;
  for (const f of folders) {
    const lists = (await j(`https://api.clickup.com/api/v2/folder/${f.id}/list?archived=false`)).lists ?? [];
    for (const l of lists) {
      for (const t of await allTasks(l.id, subtasks)) {
        const s = (t.status?.status ?? "").toLowerCase();
        if (s === "complete" || s === "completed") complete++; else if (s === "pending") pending++;
      }
    }
  }
  console.log(`subtasks=${subtasks}: COMPLETE=${complete} PENDING=${pending}`);
}
console.log("dashboard: COMPLETE 335 PENDING 569");
