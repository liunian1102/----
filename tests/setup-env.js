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
    quadraticCurveTo() {}
    bezierCurveTo() {}
    ellipse() {}
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

function createDummyElem() {
    const el = {
        style: { setProperty() {}, removeProperty() {}, background: '', color: '', display: '' },
        dataset: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        innerText: '',
        innerHTML: '',
        addEventListener: () => {},
        appendChild: (child) => { el.children.push(child); return child; },
        append: (...children) => { el.children.push(...children); },
        setAttribute: () => {},
        offsetWidth: 800,
        offsetHeight: 600,
        clientWidth: 800,
        clientHeight: 600,
        width: 800,
        height: 600,
        textContent: '',
        firstChild: null,
        lastChild: null,
        children: [],
        getContext: () => new global.CanvasRenderingContext2D(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    // 预分配多层子元素插槽,支持如 row.children[0].style.background 等安全访问
    for (let i = 0; i < 6; i++) {
        el.children.push({
            style: { setProperty() {}, removeProperty() {}, background: '', color: '' },
            textContent: '',
            children: []
        });
    }
    el.firstChild = el.children[0];
    el.lastChild = el.children[el.children.length - 1];
    return el;
}

const dummyElem = createDummyElem();

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
    createElement: (tag) => createDummyElem(),
    createElementNS: (ns, tag) => createDummyElem(),
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
// 角色立绘表(node 里没有 Image,Art 自动禁用,渲染走原来的矢量方块画法)
vm.runInThisContext(fs.readFileSync(path.resolve(__dirname, '../art.js'), 'utf8'));
const gamePath = path.resolve(__dirname, '../game.js');
const code = fs.readFileSync(gamePath, 'utf8');
vm.runInThisContext(code);

if (typeof Sound !== 'undefined' && Sound.init) {
    Sound.init();
}

module.exports = { mockStorage };
