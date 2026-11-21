import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WEB-PERF-070. src/lib/toast.ts loads sonner on the first call. These pin
 * the contract callers relied on when they imported sonner directly: calls
 * land in order, an id comes back synchronously, and the same id reaches
 * sonner so a later toast can replace an earlier one.
 */
type Data = { id?: string | number; description?: string };
const { calls, sonnerToast } = vi.hoisted(() => {
  const calls: Array<[string, unknown, Data]> = [];
  const record = (kind: string) => (m: unknown, d: Data) => {
    calls.push([kind, m, d]);
    return d.id;
  };
  const sonnerToast = Object.assign(vi.fn(record("default")), {
    success: vi.fn(record("success")),
    info: vi.fn(record("info")),
    warning: vi.fn(record("warning")),
    error: vi.fn(record("error")),
    message: vi.fn(record("message")),
    dismiss: vi.fn(),
  });
  return { calls, sonnerToast };
});
vi.mock("sonner", () => ({ toast: sonnerToast }));

async function fresh() {
  vi.resetModules();
  return (await import("@/lib/toast")).toast;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("lazy toast (WEB-PERF-070)", () => {
  it("queues calls made before sonner loads and replays them in order", async () => {
    const toast = await fresh();
    toast.error("first");
    toast("second");
    toast.success("third", { description: "d" });
    expect(calls).toEqual([]);
    await flush();
    expect(calls.map(([k, m]) => [k, m])).toEqual([
      ["error", "first"],
      ["default", "second"],
      ["success", "third"],
    ]);
    expect(calls[2][2]).toMatchObject({ description: "d" });
  });

  it("returns an id synchronously and hands the same id to sonner", async () => {
    const toast = await fresh();
    const minted = toast.info("a");
    const given = toast.warning("b", { id: "fav-1" });
    expect(given).toBe("fav-1");
    expect(typeof minted).toBe("string");
    await flush();
    expect(calls[0][2].id).toBe(minted);
    expect(calls[1][2].id).toBe("fav-1");
    expect(toast.message("c")).not.toBe(minted);
  });

  it("calls sonner synchronously once it has loaded", async () => {
    const toast = await fresh();
    toast.success("warm-up");
    await flush();
    calls.length = 0;
    toast.error("now");
    expect(calls.map(([k, m]) => [k, m])).toEqual([["error", "now"]]);
  });

  it("does not load sonner just to dismiss", async () => {
    const toast = await fresh();
    toast.dismiss("x");
    await flush();
    expect(sonnerToast.dismiss).not.toHaveBeenCalled();
    toast.success("y");
    toast.dismiss("y");
    await flush();
    expect(sonnerToast.dismiss).toHaveBeenCalledWith("y");
  });
});
