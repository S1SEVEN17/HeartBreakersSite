// HEART BREAKERS SUITE - PUBLISHED VERSION (Nov 15 2026, user: "I want them to be pushed ASAP to users" / "Add the
// Stronger banner for further out of date scripts. A 'required version' banner when any major updates are pushed.")
// Written by the PUBLISH step, in the same commit as suite/Heart Breakers Suite.user.js: this deploys with the Worker,
// and the Chain Watch room sends it to every script in its state / sync messages (chainroom.js `suite`), so the
// Suite's update banner shows within seconds of the deploy instead of at its old 6-hourly check.
//   SUITE_LATEST   - the version just published (Greasy Fork gets it from the same push).
//   SUITE_REQUIRED - "" or the lowest version members must run: older Suites show a red "Update required" banner
//                    that can't be dismissed. Only set when the user says so (Claude prompts on major updates).
export const SUITE_LATEST = "0.2.98";
export const SUITE_REQUIRED = "0.2.97";
