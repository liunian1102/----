// setup-env.js
const fs = require('fs');
const vm = require('vm');

const mockStorage = {};
global.localStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

global.CanvasRenderingContext2D = class {
    constructor() {}
    save() {}
    restore() {}
    fillRect() {}
    strokeRect() {}
    clearRect() {}
    beginPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    arcTo() {}
    roundRect() {}
    fill() {}
    stroke() {}
    measureText() { return { width: 50 }; }
    fillText() {}
    strokeText() {}
    drawImage() {}
    createRadialGradient() { return { addColorStop: () => {} }; }
    createLinearGradient() { return { addColorStop: () => {} }; }
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
    setTransform() {}
    resetTransform() {}
    translate() {}
    scale() {}
    rotate() {}
    clip() {}
    setLineDash() {}
    getLineDash() { return []; }
};

const dummyElem = {
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    innerText: '',
    innerHTML: '',
    addEventListener: () => {},
    appendChild: () => {},
    setAttribute: () => {},
    offsetWidth: 800,
    offsetHeight: 600,
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    textContent: '',
    firstChild: { textContent: '' },
    lastChild: { textContent: '' },
    children: [],
    getContext: () => new global.CanvasRenderingContext2D(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
};

global.window = global;
global.window.addEventListener = () => {};
global.window.innerWidth = 1024;
global.window.innerHeight = 768;
global.window.devicePixelRatio = 1;
global.window.location = { hash: '', hostname: 'localhost' };
global.window.requestAnimationFrame = (fn) => 1;
global.window.cancelAnimationFrame = (id) => {};
global.setInterval = () => 1;
global.clearInterval = () => {};

global.document = {
    getElementById: (id) => dummyElem,
    querySelectorAll: () => [],
    createElement: () => dummyElem,
    createElementNS: (ns, tag) => dummyElem,
    body: dummyElem,
    hidden: false,
    addEventListener: () => {}
};

global.navigator = {
    maxTouchPoints: 0,
    vibrate: () => {}
};

global.AudioContext = class {
    constructor() { this.destination = {}; this.currentTime = 0; this.state = 'running'; }
    createGain() { return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} }, connect: () => {} }; }
    createOscillator() { return { type: '', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, start: () => {}, stop: () => {}, connect: () => {} }; }
    createBiquadFilter() {
        const filter = {
            type: 'lowpass',
            frequency: {
                value: 20000,
                setValueAtTime(v) { this.value = v; },
                exponentialRampToValueAtTime(v) { this.value = v; },
                cancelScheduledValues() {}
            },
            Q: { setValueAtTime() {} },
            connect() {}
        };
        return filter;
    }
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(1000) }; }
};
global.webkitAudioContext = global.AudioContext;
global.WebSocket = class {
    constructor() {}
    send() {}
    close() {}
};

const path = require('path');
const gamePath = path.resolve(__dirname, '../game.js');
const code = fs.readFileSync(gamePath, 'utf8');
vm.runInThisContext(code);

if (typeof Sound !== 'undefined' && Sound.init) {
    Sound.init();
}

module.exports = { mockStorage };
