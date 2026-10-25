import type { HostInterface } from "@course-suite/host";

/**
 * Placeholder page until the editor arrives in wave G: shows the app's name and version, which it
 * asks the host for, so the page proves the host reaches the shell end to end.
 */
export async function showPage(host: HostInterface, root: HTMLElement): Promise<void> {
  const heading = root.ownerDocument.createElement("h1");
  const status = root.ownerDocument.createElement("p");
  status.setAttribute("role", "status");
  root.replaceChildren(heading, status);
  try {
    const { name, version, edition } = await host.appInfo();
    heading.textContent = name;
    root.ownerDocument.title = name;
    status.textContent = `Version ${version}, ${edition} edition`;
  } catch (error) {
    status.textContent = `The app could not start: ${error instanceof Error ? error.message : String(error)}`;
  }
}
