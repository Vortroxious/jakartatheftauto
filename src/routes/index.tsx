import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import shell from "../game/shell.html?raw";

export const Route = createFileRoute("/")({
  component: Home,
});

declare global {
  interface Window {
    __JP_BOOT?: boolean;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.body.appendChild(s);
  });
}

function Home() {
  useEffect(() => {
    const root = document.getElementById("jp-root");
    if (!root) return;
    if (!root.querySelector("canvas")) root.innerHTML = shell;
    document.getElementById("boot-splash")?.remove();
    if (window.__JP_BOOT) return;
    window.__JP_BOOT = true;
    loadScript("/vendor/three.min.js")
      .then(() => loadScript("/game.js?v=14"))
      .catch((err) => {
        console.error(err);
        const note = document.createElement("p");
        note.textContent = "The city failed to load. Reload the page.";
        note.className = "absolute top-1/2 right-0 left-0 text-center text-lg";
        root.appendChild(note);
      });
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#10131a] text-white">
      <h1
        id="boot-splash"
        className="pointer-events-none absolute top-[18vh] right-0 left-0 text-center font-[Impact,Haettenschweiler,sans-serif] text-[12vw] tracking-[0.18em] text-[#f5c542]"
      >
        JAKARTA PUSAT
      </h1>
      <p className="sr-only">
        The Last Delivery. Cars and people pathfind on their own. Press M for a live map of Central
        Jakarta. Add a Google Maps API key in Settings or on the city map to use Google imagery.
      </p>
      <div id="jp-root" className="absolute inset-0" />
    </main>
  );
}
