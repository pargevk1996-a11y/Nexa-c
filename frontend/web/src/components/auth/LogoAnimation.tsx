import { useEffect, useRef } from "react";

interface Node3D {
  ox: number;
  oy: number;
  oz: number;
}

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  r: number; hue: number;
}

let faviconSet = false;

const NODE_COUNT = 28;
const RADIUS = 82;
const FOV = 340;
const EDGE_MAX_DIST_SQ = (RADIUS * 0.78) ** 2;
const ROT_SPEED = 0.007;

function fibonacciSphere(count: number, r: number): Node3D[] {
  const nodes: Node3D[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    nodes.push({
      ox: Math.cos(theta) * radius * r,
      oy: y * r,
      oz: Math.sin(theta) * radius * r,
    });
  }
  return nodes;
}

interface Props {
  size?: number;
}

export function LogoAnimation({ size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    // All drawing is done in a virtual 220×220 space then scaled up
    const s  = size / 220;
    const cx = 110;
    const cy = 110;

    const nodes = fibonacciSphere(NODE_COUNT, RADIUS);

    const edges: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].ox - nodes[j].ox;
        const dy = nodes[i].oy - nodes[j].oy;
        const dz = nodes[i].oz - nodes[j].oz;
        if (dx * dx + dy * dy + dz * dz <= EDGE_MAX_DIST_SQ) {
          edges.push([i, j]);
        }
      }
    }

    const nodePhase = nodes.map((_, i) => i * 0.71);

    const particles: { ax: number; ay: number; az: number; r: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const dist  = RADIUS * (1.15 + Math.random() * 0.35);
      particles.push({
        ax: Math.sin(phi) * Math.cos(theta) * dist,
        ay: Math.cos(phi) * dist,
        az: Math.sin(phi) * Math.sin(theta) * dist,
        r:  0.8 + Math.random() * 1.2,
      });
    }

    // Continuous explosion sparks that emanate from the sphere surface
    const SPARK_COUNT = 55;

    function newSpark(life?: number): Spark {
      const angle = Math.random() * Math.PI * 2;
      const dist  = RADIUS * (0.78 + Math.random() * 0.48);
      const speed = 0.12 + Math.random() * 0.42;
      return {
        x:    cx + Math.cos(angle) * dist,
        y:    cy + Math.sin(angle) * dist,
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed,
        life: life ?? 1.0,
        decay: 0.007 + Math.random() * 0.012,
        r:    0.4 + Math.random() * 1.6,
        hue:  195 + Math.random() * 105,
      };
    }

    // Pre-seed at random life stages so they don't all appear at once
    const sparks: Spark[] = Array.from({ length: SPARK_COUNT }, () =>
      newSpark(Math.random()),
    );

    let angle       = 0;
    let animId: number;
    let meshPhase   = 0;
    let typingPhase = 0;

    function rotateY(x: number, y: number, z: number): [number, number, number] {
      const rx = x * Math.cos(angle) - z * Math.sin(angle);
      const rz = x * Math.sin(angle) + z * Math.cos(angle);
      return [rx, y, rz];
    }

    function project(x: number, y: number, z: number): [number, number, number] {
      const [rx, ry, rz] = rotateY(x, y, z);
      const sc = FOV / (FOV + rz + 80);
      return [cx + rx * sc, cy + ry * sc, rz];
    }

    function nodeColor(pz: number, pulse: number): string {
      const t   = (pz + RADIUS) / (2 * RADIUS);
      const hue = 270 - t * 90 - pulse * 18;
      const sat = 75 + t * 25;
      const lit = 38 + t * 34 + pulse * 14;
      const alpha = 0.4 + t * 0.45 + pulse * 0.15;
      return `hsla(${hue},${sat}%,${lit}%,${alpha})`;
    }

    function edgeAlpha(z1: number, z2: number): number {
      const t = ((z1 + z2) / 2 + RADIUS) / (2 * RADIUS);
      return 0.10 + t * 0.44;
    }

    function edgeColor(z1: number, z2: number): string {
      const t   = ((z1 + z2) / 2 + RADIUS) / (2 * RADIUS);
      const hue = 270 - t * 90;
      return `hsl(${hue},${70 + t * 30}%,${50 + t * 30}%)`;
    }

    function drawChatBubble() {
      const rx  = 28;
      const ry  = 21;
      const ecx = cx;
      const ecy = cy - 3;

      const center = Math.PI * 0.75;
      const spread = 0.34;
      const aR = center - spread;
      const aL = center + spread;
      const pRx = ecx + rx * Math.cos(aR);
      const pRy = ecy + ry * Math.sin(aR);
      const tipX = ecx - rx - 1.7;
      const tipY = ecy + ry + 2.3;

      // Reusable path builder
      const tracePath = () => {
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, rx, ry, 0, aR, aL, true);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(pRx, pRy);
        ctx.closePath();
      };

      ctx.save();

      // Glow halo — 3 blurred stroke passes
      const glowWidths  = [9, 6, 3.5];
      const glowAlphas  = [0.07, 0.11, 0.08];
      for (let g = 0; g < 3; g++) {
        tracePath();
        ctx.strokeStyle = `rgba(150,80,255,${glowAlphas[g]})`;
        ctx.lineWidth   = glowWidths[g];
        ctx.stroke();
      }

      // Main gradient stroke — no fill
      const sg = ctx.createLinearGradient(tipX, ecy + ry, ecx + rx, ecy - ry);
      sg.addColorStop(0,   "rgba(190,70,255,0.95)");
      sg.addColorStop(0.5, "rgba(90,110,255,0.95)");
      sg.addColorStop(1,   "rgba(30,175,255,0.95)");
      tracePath();
      ctx.strokeStyle = sg;
      ctx.lineWidth   = 2.2;
      ctx.stroke();

      ctx.restore();

      // Typing dots with glow halo
      for (let k = 0; k < 3; k++) {
        const phase      = typingPhase - k * 0.9;
        const bounce     = Math.sin(phase) * 3.0;
        const brightness = 0.5 + ((Math.sin(phase) + 1) / 2) * 0.5;
        const dx = ecx - 13.5 + k * 13.5;
        const dy = ecy - 2 - bounce;

        // Dot glow halo
        const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, 10);
        dg.addColorStop(0, `rgba(200,170,255,${brightness * 0.35})`);
        dg.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(dx, dy, 10, 0, Math.PI * 2);
        ctx.fillStyle = dg;
        ctx.fill();

        // Dot core
        ctx.beginPath();
        ctx.arc(dx, dy, 4.0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(215,190,255,${brightness})`;
        ctx.fill();
      }
    }

    // Helpers used in both back and front passes
    function drawSingleEdge(
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number,
    ) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = edgeColor(z1, z2);
      ctx.globalAlpha = edgeAlpha(z1, z2) * 0.35;
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = edgeColor(z1, z2);
      ctx.globalAlpha = edgeAlpha(z1, z2);
      ctx.lineWidth   = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawSingleNode(px: number, py: number, pz: number, ni: number) {
      const t     = (pz + RADIUS) / (2 * RADIUS);
      const pulse = (Math.sin(meshPhase + nodePhase[ni]) + 1) / 2;
      const r     = (1.5 + t * 2.0) * (0.65 + pulse * 0.7);

      if (t > 0.20) {
        const glowR = r * (4.0 + pulse * 3.0);
        const glow  = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        const hue   = 270 - t * 90 - pulse * 18;
        glow.addColorStop(0, `hsla(${hue},100%,82%,${(t - 0.20) * pulse * 0.50})`);
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(pz, pulse);
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.scale(s, s);

      angle       += ROT_SPEED;
      meshPhase   += 0.038;
      typingPhase += 0.062;

      const proj = nodes.map((n) => project(n.ox, n.oy, n.oz));

      const sortedEdges = [...edges].sort((a, b) => {
        const za = (proj[a[0]][2] + proj[a[1]][2]) / 2;
        const zb = (proj[b[0]][2] + proj[b[1]][2]) / 2;
        return za - zb;
      });

      const sortedNodes = proj
        .map((p, i) => ({ p, i }))
        .sort((a, b) => a.p[2] - b.p[2]);

      // ── BACK PASS: mesh behind the bubble ──────────────────────────
      for (const [i, j] of sortedEdges) {
        if ((proj[i][2] + proj[j][2]) / 2 >= 0) continue;
        drawSingleEdge(...proj[i] as [number,number,number], ...proj[j] as [number,number,number]);
      }
      for (const { p: [px, py, pz], i } of sortedNodes) {
        if (pz >= 0) continue;
        drawSingleNode(px, py, pz, i);
      }

      // ── CHAT BUBBLE — embedded at sphere centre ────────────────────
      drawChatBubble();

      // ── FRONT PASS: mesh in front of the bubble ────────────────────
      for (const [i, j] of sortedEdges) {
        if ((proj[i][2] + proj[j][2]) / 2 < 0) continue;
        drawSingleEdge(...proj[i] as [number,number,number], ...proj[j] as [number,number,number]);
      }
      for (const { p: [px, py, pz], i } of sortedNodes) {
        if (pz < 0) continue;
        drawSingleNode(px, py, pz, i);
      }

      // Ambient particles with light glow
      for (const p of particles) {
        const [px, py, pz] = project(p.ax, p.ay, p.az);
        const t   = (pz + RADIUS) / (2 * RADIUS);
        const hue = 270 - t * 90;
        const pg  = ctx.createRadialGradient(px, py, 0, px, py, p.r * 3);
        pg.addColorStop(0, `hsla(${hue},80%,72%,${0.18 + t * 0.22})`);
        pg.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(px, py, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},80%,70%,${0.25 + t * 0.40})`;
        ctx.fill();
      }

      // Explosion sparks — drawn last so they appear over the sphere
      for (let i = 0; i < sparks.length; i++) {
        const sp = sparks[i];
        sp.life -= sp.decay;
        if (sp.life <= 0) { sparks[i] = newSpark(); continue; }
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vx *= 0.982; // gentle deceleration
        sp.vy *= 0.982;

        const a = sp.life * sp.life; // quadratic fade-out

        // Glow halo
        const sg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sp.r * 4.5);
        sg.addColorStop(0, `hsla(${sp.hue},92%,78%,${a * 0.55})`);
        sg.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * 4.5, 0, Math.PI * 2);
        ctx.fillStyle = sg;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${sp.hue},88%,82%,${a})`;
        ctx.fill();
      }

      ctx.restore();

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    // Capture a 64×64 snapshot for the browser favicon (first mounted instance only)
    let faviconTimer: ReturnType<typeof setTimeout> | undefined;
    if (!faviconSet) {
      faviconSet = true;
      faviconTimer = setTimeout(() => {
        const off = document.createElement("canvas");
        off.width = 64; off.height = 64;
        const octx = off.getContext("2d");
        if (octx) {
          octx.drawImage(canvas, 0, 0, 64, 64);
          const dataUrl = off.toDataURL("image/png");
          let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = dataUrl;
        }
      }, 1200);
    }

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(faviconTimer);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "block" }}
      aria-hidden
    />
  );
}
