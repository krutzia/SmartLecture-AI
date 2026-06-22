const KEY = "smartlecture_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function resetDeviceId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}
