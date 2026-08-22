// WEB-CI-026 AC4 probe. Deliberate type error to prove the required status
// check actually blocks a merge. This file and its branch are deleted as soon
// as GitHub reports the PR blocked -- if you are reading this on main,
// something went wrong and it should be removed.
export const probe: number = 'this is a string, not a number';
