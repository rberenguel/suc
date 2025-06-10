// --- 1. Configuration & State ---
// Central place for all settings and dynamic state.

const config = {
  SHAKE_DURATION: 80,
  SHAKE_OFFSET_TD: 6,
  SHAKE_OFFSET_BODY: 2,
  FIREWORK_FRICTION: 0.98,
  PARTICLE_DECAY_MIN: 0.007,
  PARTICLE_DECAY_RANDOM: 0.005,
  TABLE_SELECTOR: 'td[data-tooltip="Select"]',
};

const state = {
  particles: [],
  animationRunning: false,
  ctx: null,
  keyboard: {
    lastAction: undefined,
    keyHistory: [],
  },
  effectsEnabled: true,
};

// --- 2. Core Modules (Self-Contained Logic) ---
// Each object groups related functions.

/**
 * Handles all particle effects: fireworks, explosions, and aiming reticles.
 */
const fireworks = {
  setupCanvas() {
    let canvas = document.getElementById("fireworks");
    if (canvas) {
      state.ctx = canvas.getContext("2d");
      return true;
    }
    canvas = document.createElement("canvas");
    canvas.id = "fireworks";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = `position: absolute; left: 0; top: 0; z-index: 10000; background-color: transparent; pointer-events: none;`;
    document.body.append(canvas);
    state.ctx = canvas.getContext("2d");
    return true;
  },

  destroyCanvas() {
    const canvas = document.getElementById("fireworks");
    if (canvas) canvas.parentElement.removeChild(canvas);
    state.ctx = null;
  },

  createAim(endX, endY, onCompleteCallback) {
    if (!this.setupCanvas()) return;
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 100;
    const startX = endX + Math.cos(angle) * distance;
    const startY = endY + Math.sin(angle) * distance;
    const startRotation = (Math.random() - 0.5) * Math.PI;
    state.particles.push({
      startX,
      startY,
      endX,
      endY,
      x: startX,
      y: startY,
      startRotation,
      rotation: startRotation,
      onComplete: onCompleteCallback,
      type: "aim",
      life: 1.0,
      decay: 0.04,
    });
    if (!state.animationRunning) {
      state.animationRunning = true;
      requestAnimationFrame(this.animate.bind(this));
    }
  },

  explode(x, y) {
    if (!this.setupCanvas()) return;
    const particlesLength = 15 + Math.random() * 25;
    const colors = this.getColorScheme();

    for (let i = 0; i < particlesLength; i++) {
      const angle = (i / particlesLength) * Math.PI * 2;
      const speed = Math.random() * 0.8 + Math.random() * 0.4;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[0][Math.floor(Math.random() * colors[0].length)],
        explodeColor: colors[1][Math.floor(Math.random() * colors[1].length)],
        radius: window.devicePixelRatio,
        alpha: 1,
        decay:
          config.PARTICLE_DECAY_MIN +
          Math.random() * config.PARTICLE_DECAY_RANDOM,
        trail: [],
      });
    }
    if (!state.animationRunning) {
      state.animationRunning = true;
      requestAnimationFrame(this.animate.bind(this));
    }
  },
  explosion(x, y) {
    if (!this.setupCanvas()) return;
    const particlesLength = 40 + Math.random() * 20;
    for (let i = 0; i < particlesLength; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: window.devicePixelRatio * (0.5 + Math.random() * 1.5),
        alpha: 1,
        decay: 0.015 + Math.random() * 0.005,
        type: "explosion",
      });
    }
    if (!state.animationRunning) {
      state.animationRunning = true;
      requestAnimationFrame(this.animate.bind(this));
    }
  },

  animate() {
    if (!state.ctx) {
      state.animationRunning = false;
      return;
    }
    state.ctx.clearRect(0, 0, state.ctx.canvas.width, state.ctx.canvas.height);
    state.particles = state.particles.filter((p) => p.alpha > 0 || p.life > 0);

    state.particles.forEach((p) => {
      if (p.type === "aim") {
        p.life -= p.decay;
        if (p.life <= 0) {
          p.alpha = 0;
          if (p.onComplete) p.onComplete();
          state.particles.push({
            x: p.endX,
            y: p.endY,
            type: "aim-blip",
            radius: 15,
            life: 1,
            decay: 0.05,
          });
          return;
        }
        const ease = 1 - p.life * p.life; // Ease out
        p.x = p.startX + (p.endX - p.startX) * ease;
        p.y = p.startY + (p.endY - p.startY) * ease;
        p.radius = 15 + 150 * p.life;
        p.alpha = 0.9 - 0.7 * p.life;
        p.rotation = p.startRotation * p.life;
      } else if (p.type === "aim-blip") {
        p.life -= p.decay;
        if (p.life <= 0) p.alpha = 0;
        else p.alpha = p.life > 0.5 ? 1.0 : p.life * 2;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        if (p.type === "explosion") {
          p.vy += 0.075;
        } else {
          p.y += (p.alpha > 0.5 ? -25 : 2) * p.decay;
          if (!p.trail) p.trail = [];
          p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
          if (p.trail.length > 5 + Math.random() * 10) p.trail.shift();
        }
        p.vx *= config.FIREWORK_FRICTION;
        p.vy *= config.FIREWORK_FRICTION;
        p.alpha -= p.decay;
      }
      if (p.trail) {
        p.trail.forEach((tp) =>
          this.drawParticle(p, tp.x, tp.y, tp.alpha, true),
        );
      }
      if (p.alpha > 0) this.drawParticle(p, p.x, p.y, p.alpha, false);
    });
    if (state.particles.length > 0) {
      requestAnimationFrame(this.animate.bind(this));
    } else {
      state.animationRunning = false;
      this.destroyCanvas();
    }
  },

  drawParticle(p, x, y, alpha, isTrail) {
    if (!state.ctx) return;
    if (p.type === "aim") {
      const radius = p.radius;
      state.ctx.save();
      state.ctx.translate(x, y);
      state.ctx.rotate(p.rotation);
      state.ctx.strokeStyle = `rgba(255, 20, 20, ${p.alpha})`;
      state.ctx.lineWidth = 1 + 2.5 * (1 - p.life);
      state.ctx.beginPath();
      state.ctx.arc(0, 0, radius, 0, Math.PI * 2);
      state.ctx.moveTo(-radius, 0);
      state.ctx.lineTo(radius, 0);
      state.ctx.moveTo(0, -radius);
      state.ctx.lineTo(0, radius);
      state.ctx.stroke();
      state.ctx.restore();
      return;
    }
    if (p.type === "aim-blip") {
      state.ctx.fillStyle = `rgba(255, 20, 20, ${p.alpha})`;
      state.ctx.beginPath();
      state.ctx.arc(x, y, p.radius, 0, Math.PI * 2);
      state.ctx.fill();
      return;
    }
    state.ctx.beginPath();
    state.ctx.arc(x, y, p.radius, 0, Math.PI * 2);
    let style;
    if (p.type === "explosion") {
      const life = Math.max(0, alpha);
      let r, g;
      if (life > 0.6) {
        r = 255;
        g = Math.floor(255 * ((life - 0.6) / 0.4));
      } else {
        r = Math.floor(255 * (life / 0.6));
        g = 0;
      }
      style = `rgba(${r}, ${g}, 0, ${life})`;
    } else {
      if (isTrail) {
        style =
          p.alpha <= 0 && p.alpha > -5 * p.decay
            ? p.explodeColor + "1)"
            : p.color + alpha + ")";
      } else {
        style = p.color + alpha + ")";
      }
    }
    state.ctx.fillStyle = style;
    state.ctx.fill();
  },

  getColorScheme() {
    const rgb = (c) =>
      `rgb(${c[0] * (150 + Math.random() * 100)},${
        c[1] * (150 + Math.random() * 100)
      },${c[2] * (150 + Math.random() * 100)}`;
    const silver = Array.from(
      { length: 4 },
      () =>
        `rgb(${[...Array(3)].map(() => 200 + Math.random() * 55).join(", ")}, `,
    );
    const gold = Array.from({ length: 4 }, () => {
      const s = 150 + Math.random() * 85;
      return `rgb(${s}, ${0.8 * s}, 100, `;
    });
    const rainbow = [
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
    ].map(rgb);
    const blue = [
      [0.4, 0.4, 1.5],
      [0.2, 0.2, 1.5],
      [0.3, 0.3, 1.5],
    ].map(rgb);
    const red = [
      [1.4, 0.4, 0.4],
      [1.4, 0.2, 0.2],
      [1.5, 0.3, 0.3],
    ].map(rgb);
    const yellow = [
      [1.4, 1.4, 0.4],
      [1.4, 1.2, 0.2],
      [1.5, 1.3, 0.3],
    ].map(rgb);
    const colorMap = [
      [gold, yellow],
      [gold, red],
      [gold, gold],
      [silver, silver],
      [silver, blue],
      [silver, yellow],
      [rainbow, rainbow],
    ];
    return colorMap[Math.floor(Math.random() * colorMap.length)];
  },
};

/**
 * Handles DOM element interactions.
 */
const domInteraction = {
  shakeElement(element, maxOffset) {
    element.style.transition = "transform 0.1s ease-in-out";
    const randomX = Math.floor((Math.random() - 0.5) * 2 * maxOffset);
    const randomY = Math.floor((Math.random() - 0.5) * 2 * maxOffset);
    const randomRot =
      element.tagName === "BODY" ? 0 : Math.floor((Math.random() - 0.5) * 2);
    element.style.transform = `translate(${randomX}px, ${randomY}px) rotate(${randomRot}deg)`;
    setTimeout(
      () => (element.style.transform = "translate(0, 0) rotate(0deg)"),
      config.SHAKE_DURATION,
    );
  },
};

/**
 * Handles keyboard input and state transitions.
 */
const keyboard = {
  init() {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  },
  handleKeyDown(e) {
    const key = e.key.toLowerCase();
    console.log(state.keyboard.lastAction);
    if (key !== "shift") {
      state.keyboard.keyHistory.push(key);
      state.keyboard.keyHistory = state.keyboard.keyHistory.slice(-2);
    }
    const lastTwoKeys = state.keyboard.keyHistory.join("");
    if (key === "x") {
      state.keyboard.lastAction = "selectOne";
    } else if (key === "a" && lastTwoKeys === "*a") {
      state.keyboard.lastAction = "selectAll";
    } else if (
      key === "e" &&
      ["selectOne", "selectAll", "markAsRead"].includes(
        state.keyboard.lastAction,
      )
    ) {
      state.keyboard.lastAction = "archive";
      this.triggerArchiveAction();
    } else if (key === "i") {
      console.log("i!");
      state.keyboard.lastAction = "markAsRead";
      this.triggerMarkAsReadEffect();
    } else {
      state.keyboard.lastAction = undefined;
    }
  },
  triggerArchiveAction() {
    if (!state.effectsEnabled) return;
    if (!document.getElementById("fireworks")) fireworks.setupCanvas();
    domInteraction.shakeElement(document.body, config.SHAKE_OFFSET_BODY);
    const w = document.documentElement.clientWidth,
      h = document.documentElement.clientHeight;
    for (let i = 0; i < 10 + Math.random() * 15; i++) {
      fireworks.explosion(Math.random() * w, Math.random() * h);
    }
  },
  triggerMarkAsReadEffect() {
    if (!state.effectsEnabled) return;
    const selectedRows = [...document.querySelectorAll("tr")].filter((row) =>
      domObserver.isRowSelected(row),
    );
    console.log(selectedRows);
    selectedRows.forEach((row, i) => {
      setTimeout(() => domObserver.startFuseAnimation(row), i * 50);
    });
  },
};

/**
 * Observes the DOM for table changes and triggers actions.
 */
const domObserver = {
  init() {
    const observer = new MutationObserver(this.handleMutation.bind(this));
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-checked"],
    });
  },
  handleMutation(mutationsList) {
    if (!["selectOne", "selectAll"].includes(state.keyboard.lastAction)) return;
    for (const mutation of mutationsList) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "aria-checked"
      ) {
        const row = mutation.target.closest("tr");
        if (row && this.isRowSelected(row)) {
          this.triggerEffect(row);
          // TODO: improve the potential needed effect debouncing
          //state.keyboard.lastAction = undefined;
          return;
        }
      }
    }
  },
  isRowSelected(row) {
    const checkbox = row.querySelector('div[role="checkbox"]');
    return checkbox && checkbox.getAttribute("aria-checked") === "true";
  },
  triggerEffect(row) {
    if (!state.effectsEnabled) return;
    const onAimComplete = () => {
      row.style.transition = "box-shadow 0.1s ease-in-out";
      row.style.boxShadow = "inset 0 0 0 2px rgba(255, 20, 20, 0.7)";
      setTimeout(() => {
        row.style.boxShadow = "none";
      }, 250);
    };
    const rect = row.getBoundingClientRect();
    fireworks.createAim(
      rect.left + 25,
      rect.top + rect.height / 2,
      onAimComplete,
    );
  },
  startFuseAnimation(row) {
    const rect = row.getBoundingClientRect();
    let currentX = rect.left;
    const fuseInterval = setInterval(() => {
      if (currentX > rect.right) {
        clearInterval(fuseInterval);
        return;
      }
      fireworks.explosion(currentX, rect.top + Math.random() * rect.height);
      currentX += 25;
    }, 8);
  },
};

// --- 3. Script Entry Point ---
function main() {
  document.documentElement.style.backgroundColor = "black";
  keyboard.init();
  domObserver.init();
  effectsToggle.init();
}

const effectsToggle = {
  key: "sucEffectsEnabled",

  init() {
    this.createToggleUI();
    this.loadState();
    this.listenForChanges();
  },

  createToggleUI() {
    const toggleContainer = document.createElement("div");
    toggleContainer.innerHTML = `
            <style>
                .suc-toggle-container {
                    position: fixed;
                    top: 1em;
                    left: 60%;
                    z-index: 10001; /* Higher than the canvas */
                    display: flex;
                    align-items: center;
                    font-family: sans-serif;
                    color: white;
                    background: rgba(0,0,0,0.5);
                    padding: 2px 4px;
                    border-radius: 8px;
                    transform: translateX(-50%);
                }
                .suc-toggle-container label {
                    margin-right: 4px;
                    margin-bottom: 2px;
                    margin-left: 2px;
                    user-select: none;
                    font-size: 90%;
                }
                .suc-toggle {
                    position: relative;
                    display: inline-block;
                    width: 20px;
                    height: 13px;
                }
                .suc-toggle input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .suc-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #555;
                    transition: .4s;
                    border-radius: 12px;
                }
                .suc-slider:before {
                    position: absolute;
                    content: "";
                    height: 6px;
                    width: 6px;
                    left: 4px;
                    bottom: 4px;
                    background-color: white;
                    transition: .4s;
                    border-radius: 50%;
                }
                input:checked + .suc-slider {
                    background-color: #dd4433;
                }
                input:checked + .suc-slider:before {
                    transform: translateX(6px);
                }
            </style>
            <div class="suc-toggle-container">
                <label for="suc-toggle-checkbox">suc</label>
                <label class="suc-toggle">
                    <input type="checkbox" id="suc-toggle-checkbox">
                    <span class="suc-slider"></span>
                </label>
            </div>
        `;
    document.body.appendChild(toggleContainer);
  },

  loadState() {
    chrome.storage.sync.get([this.key], (result) => {
      const isEnabled =
        result[this.key] === undefined ? true : result[this.key];
      state.effectsEnabled = isEnabled;
      document.getElementById("suc-toggle-checkbox").checked = isEnabled;
    });
  },

  listenForChanges() {
    document
      .getElementById("suc-toggle-checkbox")
      .addEventListener("change", (event) => {
        const isEnabled = event.target.checked;
        state.effectsEnabled = isEnabled;
        chrome.storage.sync.set({ [this.key]: isEnabled });
      });
  },
};

main();
