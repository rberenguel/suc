// --- 1. Configuration & State ---
// Central place for all settings and dynamic state.

const config = {
    SHAKE_DURATION: 80,
    SHAKE_OFFSET_TD: 6,
    SHAKE_OFFSET_BODY: 2,
    FIREWORK_FRICTION: 0.98,
    PARTICLE_DECAY_MIN: 0.007,
    PARTICLE_DECAY_RANDOM: 0.005,
    OBSERVE_DELAY: 1000,
    TABLE_SELECTOR: 'td[data-tooltip="Select"]',
};

const state = {
    particles: [],
    animationRunning: false,
    ctx: null,
    keyboard: {
        lastAction: undefined,
        keyHistory: [], // More descriptive name
    },
};


// --- 2. Core Modules (Self-Contained Logic) ---
// Each object groups related functions.

/**
 * Handles all fireworks canvas creation, drawing, and events.
 */
const fireworks = {
    setupCanvas() {
        let canvas = document.createElement("canvas");
        canvas.id = "fireworks";
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.cssText = `
            position: absolute; left: 0; top: 0;
            z-index: 10000; background-color: transparent; pointer-events: none;
        `;
        document.body.append(canvas);
        state.ctx = canvas.getContext("2d");
        return canvas;
    },

    destroyCanvas() {
        const canvas = document.getElementById("fireworks");
        if (canvas) canvas.parentElement.removeChild(canvas);
        state.ctx = null;
    },

    explode(x, y) {
        const particlesLength = 15 + Math.random() * 25;
        const colors = this.getColorScheme();

        for (let i = 0; i < particlesLength; i++) {
            const angle = (i / particlesLength) * Math.PI * 2;
            const speed = Math.random() * 0.8 + Math.random() * 0.4;
            state.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: colors[0][Math.floor(Math.random() * colors[0].length)],
                explodeColor: colors[1][Math.floor(Math.random() * colors[1].length)],
                radius: window.devicePixelRatio,
                alpha: 1,
                decay: config.PARTICLE_DECAY_MIN + Math.random() * config.PARTICLE_DECAY_RANDOM,
                trail: [],
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
        state.particles = state.particles.filter(p => p.alpha > -5 * p.decay);

        state.particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            p.y += (p.alpha > 0.5 ? -25 : 2) * p.decay; // Simplified gravity/lift
            p.vx *= config.FIREWORK_FRICTION; p.vy *= config.FIREWORK_FRICTION;
            p.alpha -= p.decay;
            p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
            if (p.trail.length > (5 + Math.random() * 10)) p.trail.shift();

            // Drawing logic...
            p.trail.forEach(trailPoint => this.drawParticle(p, trailPoint.x, trailPoint.y, trailPoint.alpha, true));
            if (p.alpha > 0) this.drawParticle(p, p.x, p.y, p.alpha * 4, false);
        });

        if (state.particles.length > 0) {
            requestAnimationFrame(this.animate.bind(this));
        } else {
            state.animationRunning = false;
            this.destroyCanvas(); // Auto-cleanup canvas when done
        }
    },

    drawParticle(p, x, y, alpha, isTrail) {
        if (!state.ctx) return;
        state.ctx.beginPath();
        state.ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        if (isTrail) {
            state.ctx.fillStyle = (p.alpha <= 0 && p.alpha > -5 * p.decay) ? p.explodeColor + ")" : p.color + alpha + ")";
        } else {
            state.ctx.fillStyle = p.color + alpha + ")";
        }
        state.ctx.fill();
    },

    getColorScheme() {
        const rgb = c => `rgb(${c[0] * (150 + Math.random() * 100)}, ${c[1] * (150 + Math.random() * 100)}, ${c[2] * (150 + Math.random() * 100)}`;
        const silver = Array.from({ length: 4 }, () => `rgb(${[...Array(3)].map(() => 200 + Math.random() * 55).join(", ")}, `);
        const gold = Array.from({ length: 4 }, () => { const s = 150 + Math.random() * 85; return `rgb(${s}, ${0.8 * s}, 100, `; });
        const rainbow = [[1,0,0], [1,0.5,0], [1,1,0], [0,0,1], [0,1,0], [1,0,1]].map(rgb);
        const blue = [[0.4,0.4,1.5], [0.2,0.2,1.5], [0.3,0.3,1.5]].map(rgb);
        const red = [[1.4,0.4,0.4], [1.4,0.2,0.2], [1.5,0.3,0.3]].map(rgb);
        const yellow = [[1.4,1.4,0.4], [1.4,1.2,0.2], [1.5,1.3,0.3]].map(rgb);
        const colorMap = [[gold,yellow], [gold,red], [gold,gold], [silver,silver], [silver,blue], [silver,yellow], [rainbow,rainbow]];
        return colorMap[Math.floor(Math.random() * colorMap.length)];
    },
};

/**
 * Handles DOM element interactions like shaking.
 */
const domInteraction = {
    shakeElement(element, maxOffset) {
        element.style.transition = 'transform 0.1s ease-in-out';
        const randomX = Math.floor((Math.random() - 0.5) * 2 * maxOffset);
        const randomY = Math.floor((Math.random() - 0.5) * 2 * maxOffset);
        element.style.transform = `translate(${randomX}px, ${randomY}px)`;
        setTimeout(() => element.style.transform = 'translate(0, 0)', config.SHAKE_DURATION);
    }
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
        if (key !== "shift") {
            state.keyboard.keyHistory.push(key);
            state.keyboard.keyHistory = state.keyboard.keyHistory.slice(-2); // Keep last 2 keys
        }

        const lastTwoKeys = state.keyboard.keyHistory.join('');

        if (key === "x") {
            state.keyboard.lastAction = "selectOne";
        } else if (key === "a" && lastTwoKeys === "*a") {
            state.keyboard.lastAction = "selectAll";
        } else if (key === "e" && ["selectOne", "selectAll"].includes(state.keyboard.lastAction)) {
            state.keyboard.lastAction = "archive";
            this.triggerArchiveAction();
        } else {
            state.keyboard.lastAction = undefined;
        }
        console.log("Action:", state.keyboard.lastAction);
    },

    triggerArchiveAction() {
        console.log("archive event");
        if (!document.getElementById("fireworks")) fireworks.setupCanvas();
        domInteraction.shakeElement(document.body, config.SHAKE_OFFSET_BODY);
        const w = document.documentElement.clientWidth;
        const h = document.documentElement.clientHeight;
        for (let i = 0; i < 10; i++) {
            fireworks.explode(Math.random() * w, Math.random() * h);
        }
    }
};

/**
 * Observes the DOM for table changes and triggers actions.
 * This version uses a single observer on the table container to handle
 * cases where rows are removed and re-added (e.g., on "undo").
 */
const domObserver = {
    init() {
        // This part is the same: wait for the table to exist initially.
        const bodyObserver = new MutationObserver((mutations, observer) => {
            const tableCell = document.querySelector(config.TABLE_SELECTOR);
            if (tableCell) {
                console.log("Table container detected. Initializing single table observer.");
                // Find a stable parent container for all rows.
                const tableContainer = tableCell.closest('tbody') || tableCell.closest('table');
                if (tableContainer) {
                    this.observeTableContainer(tableContainer);
                }
                observer.disconnect(); // We found it, no need to observe the whole body anymore.
            }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    },

    observeTableContainer(container) {
        // Create ONE observer and attach it to the stable parent (e.g., <tbody>).
        const tableObserver = new MutationObserver(this.handleTableMutation.bind(this));
        
        tableObserver.observe(container, {
            childList: true, // CRITICAL: This detects when <tr> nodes are added/removed.
            subtree: true,   // IMPORTANT: This detects changes deep inside any row.
        });

        console.log(`Single observer attached to stable container:`, container);
    },

    handleTableMutation(mutationsList) {
        // This single callback handles all changes within the table.
        for (const mutation of mutationsList) {
            // Find the <tr> that was affected by this specific mutation.
            const row = mutation.target.closest('tr');

            // Ensure it's a row we care about (i.e., contains our target cell).
            if (!row || !row.querySelector(config.TABLE_SELECTOR)) {
                continue;
            }

            // The rest of the logic is identical to before. We just derive the `row`
            // from the mutation record instead of from a pre-defined list.
            const divInstance = row.querySelectorAll("td")[4]?.querySelector("DIV");

            if (divInstance?.textContent.startsWith("selected") && ["selectOne", "selectAll"].includes(state.keyboard.lastAction)) {
                const tdToShake = divInstance.closest("tr");
                if (tdToShake) {
                    if (!document.getElementById("fireworks")) fireworks.setupCanvas();
                    const rect = tdToShake.getBoundingClientRect();
                    domInteraction.shakeElement(tdToShake, config.SHAKE_OFFSET_TD);
                    domInteraction.shakeElement(document.body, config.SHAKE_OFFSET_BODY);
                    fireworks.explode(rect.x + 20, rect.y + rect.height / 2);
                }
            }
        }
    }
};

// --- 3. Script Entry Point ---
// Kicks everything off.

function main() {
    document.documentElement.style.backgroundColor = "black";
    keyboard.init();
    domObserver.init();
    console.log("SRE helper script initialized.");
}

main();