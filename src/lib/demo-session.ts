import { DEMO_SESSION_EVENT, DEMO_SESSION_KEY } from "@/constants/demo-auth.constant";

export function hasDemoSession() {
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
}

export function startDemoSession() {
  window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");
  window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
}

export function endDemoSession() {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
}

export function subscribeDemoSession(onChange: () => void) {
  window.addEventListener(DEMO_SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(DEMO_SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getServerDemoSession() {
  return false;
}
