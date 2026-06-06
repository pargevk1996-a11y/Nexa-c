import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  dAlpha: number;
  vx: number;
  vy: number;
  blue: boolean;
}

interface Meteor {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  angle: number;
  active: boolean;
  timer: number;
}

const STAR_COUNT = 320;
const METEOR_INTERVAL_MIN = 3500;
const METEOR_INTERVAL_MAX = 8000;

function randBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const stars: Star[] = [];
    const meteor: Meteor = { x: 0, y: 0, len: 0, speed: 0, alpha: 0, angle: 0, active: false, timer: 0 };
    let nextMeteor = randBetween(METEOR_INTERVAL_MIN, METEOR_INTERVAL_MAX);
    let lastTs = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function initStars() {
      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        const r = Math.random();
        // three size layers: tiny (60%), small (30%), bright (10%)
        const size = r < 0.6 ? randBetween(0.3, 1.5) : r < 0.9 ? randBetween(1.1, 2.6) : randBetween(2.2, 4.2);
        stars.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          r: size,
          alpha: randBetween(0.2, 1.0),
          // faster twinkle for small, slower for large
          dAlpha: (Math.random() > 0.5 ? 1 : -1) * randBetween(size < 0.6 ? 0.003 : 0.001, size < 0.6 ? 0.01 : 0.006),
          vx: (Math.random() - 0.5) * 0.008,
          vy: (Math.random() - 0.5) * 0.004,
          // ~15% of stars are blue-tinted
          blue: Math.random() < 0.15,
        });
      }
    }

    function spawnMeteor() {
      const angle = randBetween(20, 40) * (Math.PI / 180);
      meteor.x = randBetween(canvas!.width * 0.1, canvas!.width * 0.7);
      meteor.y = randBetween(0, canvas!.height * 0.3);
      meteor.len = randBetween(120, 260);
      meteor.speed = randBetween(6, 12);
      meteor.alpha = 0.9;
      meteor.angle = angle;
      meteor.active = true;
    }

    function drawMeteor() {
      if (!meteor.active) return;
      const dx = Math.cos(meteor.angle) * meteor.len;
      const dy = Math.sin(meteor.angle) * meteor.len;
      const grd = ctx!.createLinearGradient(meteor.x, meteor.y, meteor.x - dx, meteor.y - dy);
      grd.addColorStop(0, `rgba(255,255,255,${meteor.alpha})`);
      grd.addColorStop(0.15, `rgba(180,200,255,${meteor.alpha * 0.6})`);
      grd.addColorStop(1, "transparent");
      ctx!.beginPath();
      ctx!.moveTo(meteor.x, meteor.y);
      ctx!.lineTo(meteor.x - dx, meteor.y - dy);
      ctx!.strokeStyle = grd;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      meteor.x += Math.cos(meteor.angle) * meteor.speed;
      meteor.y += Math.sin(meteor.angle) * meteor.speed;
      meteor.alpha -= 0.018;
      if (meteor.alpha <= 0 || meteor.x > canvas!.width || meteor.y > canvas!.height) {
        meteor.active = false;
      }
    }

    function draw(ts: number) {
      const dt = ts - lastTs;
      lastTs = ts;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      // stars
      for (const s of stars) {
        s.alpha += s.dAlpha;
        if (s.alpha <= 0.05) { s.alpha = 0.05; s.dAlpha = Math.abs(s.dAlpha); }
        if (s.alpha >= 1.0) { s.alpha = 1.0; s.dAlpha = -Math.abs(s.dAlpha); }
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x = canvas!.width;
        if (s.x > canvas!.width) s.x = 0;
        if (s.y < 0) s.y = canvas!.height;
        if (s.y > canvas!.height) s.y = 0;

        // glow for bright stars
        if (s.r > 1.0) {
          const glow = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
          const glowColor = s.blue ? `rgba(130,170,255,${s.alpha * 0.22})` : `rgba(255,255,255,${s.alpha * 0.18})`;
          glow.addColorStop(0, glowColor);
          glow.addColorStop(1, "transparent");
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
          ctx!.fillStyle = glow;
          ctx!.fill();
        }

        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = s.blue
          ? `hsla(215,80%,88%,${s.alpha})`
          : `rgba(255,255,255,${s.alpha})`;
        ctx!.fill();
      }

      // meteor
      if (!meteor.active) {
        meteor.timer += dt;
        if (meteor.timer >= nextMeteor) {
          meteor.timer = 0;
          nextMeteor = randBetween(METEOR_INTERVAL_MIN, METEOR_INTERVAL_MAX);
          spawnMeteor();
        }
      } else {
        drawMeteor();
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    initStars();
    animId = requestAnimationFrame(draw);

    const onResize = () => { resize(); initStars(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-starfield" aria-hidden />;
}
