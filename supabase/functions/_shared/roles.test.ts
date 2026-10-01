import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decideRoleChange,
  highestRole,
  planRoleWrite,
  ROLE_PRECEDENCE,
  type Role,
} from "./roles.ts";

Deno.test("highestRole: a user with two rows gets the stronger one", () => {
  assertEquals(highestRole([{ role: "user" }, { role: "admin" }]), "admin");
  assertEquals(highestRole([{ role: "admin" }, { role: "moderator" }]), "admin");
  assertEquals(highestRole([{ role: "admin" }, { role: "root_admin" }]), "root_admin");
});

Deno.test("highestRole: no rows, nulls and unknown values are 'user'", () => {
  assertEquals(highestRole([]), "user");
  assertEquals(highestRole(null), "user");
  assertEquals(highestRole([null, { role: "superuser" }, { role: 7 }]), "user");
  assertEquals(highestRole([{ role: "superuser" }, { role: "moderator" }]), "moderator");
});

Deno.test("ROLE_PRECEDENCE matches src/lib/roles.ts", async () => {
  const src = await Deno.readTextFile(
    new URL("../../../src/lib/roles.ts", import.meta.url),
  );
  const block = src.match(/ROLE_PRECEDENCE[^=]*=\s*\[([^\]]*)\]/);
  const clientOrder = [...(block?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assertEquals(clientOrder, [...ROLE_PRECEDENCE]);
});

function decide(callerRole: Role, current: Role, next: Role, self = false) {
  return decideRoleChange({
    callerId: "caller",
    callerRole,
    targetId: self ? "caller" : "target",
    current,
    next,
  }).ok;
}

Deno.test("decideRoleChange: admin cannot demote a root_admin or another admin", () => {
  assertEquals(decide("admin", "root_admin", "user"), false);
  assertEquals(decide("admin", "admin", "user"), false);
  assertEquals(decide("admin", "admin", "moderator"), false);
});

Deno.test("decideRoleChange: admin can move users and moderators below admin", () => {
  assertEquals(decide("admin", "user", "moderator"), true);
  assertEquals(decide("admin", "moderator", "user"), true);
  assertEquals(decide("admin", "user", "admin"), false);
});

Deno.test("decideRoleChange: root_admin can change anyone but themselves", () => {
  assertEquals(decide("root_admin", "root_admin", "user"), true);
  assertEquals(decide("root_admin", "admin", "user"), true);
  assertEquals(decide("root_admin", "user", "root_admin"), true);
  assertEquals(decide("root_admin", "root_admin", "user", true), false);
});

Deno.test("decideRoleChange: moderators and users assign nothing", () => {
  assertEquals(decide("moderator", "user", "user"), false);
  assertEquals(decide("user", "user", "moderator"), false);
});

Deno.test("planRoleWrite: no rows inserts", () => {
  assertEquals(planRoleWrite([], "moderator"), { deleteIds: [], updateId: null, insert: true });
});

Deno.test("planRoleWrite: one row is updated in place", () => {
  assertEquals(planRoleWrite([{ id: "a", role: "user" }], "moderator"), {
    deleteIds: [],
    updateId: "a",
    insert: false,
  });
});

Deno.test("planRoleWrite: two rows, neither holds the new role", () => {
  // Keep the strongest so a failed update leaves the effective role unchanged.
  assertEquals(
    planRoleWrite([{ id: "u", role: "user" }, { id: "a", role: "admin" }], "moderator"),
    { deleteIds: ["u"], updateId: "a", insert: false },
  );
});

Deno.test("planRoleWrite: two rows, one already holds the new role", () => {
  // Updating the admin row to 'user' would collide on (user_id, role).
  assertEquals(
    planRoleWrite([{ id: "a", role: "admin" }, { id: "u", role: "user" }], "user"),
    { deleteIds: ["a"], updateId: null, insert: false },
  );
});
