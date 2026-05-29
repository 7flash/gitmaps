/**
 * WebGPU File Canvas Demo
 * Simple implementation using WebGPU for rendering file cards
 */

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLDivElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const folderInput = document.getElementById('folderInput') as HTMLInputElement;
const info = document.getElementById('info') as HTMLDivElement;

// State
let files: string[] = [];
let cards: Card[] = [];
let device: GPUDevice | null = null;
let context: GPUCanvasContext | null = null;
let pipeline: GPURenderPipeline | null = null;
let vertexBuffer: GPUBuffer | null = null;
let indexBuffer: GPUBuffer | null = null;
let uniformBuffer: GPUBuffer | null = null;
let bindGroup: GPUBindGroup | null = null;

// Camera state
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

interface Card {
    id: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: number[];
}

// Initialize WebGPU
async function initWebGPU() {
    if (!navigator.gpu) {
        info.textContent = 'WebGPU not supported';
        return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        info.textContent = 'No GPU adapter found';
        return false;
    }

    device = await adapter.requestDevice();
    context = canvas.getContext('webgpu') as GPUCanvasContext;

    if (!context) {
        info.textContent = 'Failed to get WebGPU context';
        return false;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    // Create shader
    const shaderModule = device.createShaderModule({
        code: `
            struct Uniforms {
                camera: vec2f,
                zoom: f32,
                resolution: vec2f,
                padding: f32,
            }

            @group(0) @binding(0) var<uniform> uniforms: Uniforms;

            struct VertexOutput {
                @builtin(position) position: vec4f,
                @location(0) uv: vec2f,
                @location(1) color: vec4f,
            }

            @vertex
            fn vertexMain(
                @location(0) position: vec2f,
                @location(1) uv: vec2f,
                @location(2) cardColor: vec4f
            ) -> VertexOutput {
                var output: VertexOutput;
                // Apply camera transform
                let worldPos = position * uniforms.zoom + uniforms.camera;
                // Convert to clip space (-1 to 1)
                output.position = vec4f(
                    (worldPos.x / uniforms.resolution.x) * 2.0 - 1.0,
                    1.0 - (worldPos.y / uniforms.resolution.y) * 2.0,
                    0.0,
                    1.0
                );
                output.uv = uv;
                output.color = cardColor;
                return output;
            }

            @fragment
            fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
                // Create border effect
                let border = 2.0 / uniforms.zoom;
                let w = step(border, input.uv.x) * step(input.uv.x, 1.0 - border);
                let h = step(border, input.uv.y) * step(input.uv.y, 1.0 - border);
                let borderAlpha = 1.0 - w * h;

                // Transparent interior, colored border
                let interiorColor = vec4f(0.0, 0.0, 0.0, 0.0);
                let borderColor = vec4f(input.color.rgb, 0.8);
                return mix(interiorColor, borderColor, borderAlpha);
            }
        `
    });

    // Create pipeline
    pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vertexMain',
            buffers: [
                {
                    arrayStride: 8,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
                },
                {
                    arrayStride: 8,
                    attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
                },
                {
                    arrayStride: 16,
                    attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }],
                },
            ],
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' } } }],
        },
        primitive: { topology: 'triangle-list' },
    });

    // Create uniform buffer
    uniformBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return true;
}

// Generate grid layout for cards
function layoutCards(fileList: string[]) {
    const cardWidth = 200;
    const cardHeight = 40;
    const gap = 10;
    const columns = Math.ceil(Math.sqrt(fileList.length));

    return fileList.map((name, i) => ({
        id: i,
        name,
        x: (i % columns) * (cardWidth + gap),
        y: Math.floor(i / columns) * (cardHeight + gap),
        width: cardWidth,
        height: cardHeight,
        color: hashColor(name),
    }));
}

// Generate color from string
function hashColor(str: string): number[] {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return hslToRgb(h / 360, 0.7, 0.6);
}

// HSL to RGB
function hslToRgb(h: number, s: number, l: number): number[] {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [r, g, b];
}

// Build geometry for all cards
function buildGeometry() {
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    cards.forEach((card, cardIndex) => {
        const baseIndex = cardIndex * 4;

        // Positions
        positions.push(
            card.x, card.y,
            card.x + card.width, card.y,
            card.x, card.y + card.height,
            card.x + card.width, card.y + card.height,
        );

        // UVs
        uvs.push(0, 0, 1, 0, 0, 1, 1, 1);

        // Colors
        for (let i = 0; i < 4; i++) {
            colors.push(...card.color, 1.0);
        }

        // Indices
        indices.push(
            baseIndex, baseIndex + 1, baseIndex + 2,
            baseIndex + 1, baseIndex + 3, baseIndex + 2,
        );
    });

    // Create buffers
    vertexBuffer = device!.createBuffer({
        size: (positions.length + uvs.length) * 4 + colors.length * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const positionData = new Float32Array(positions);
    const uvData = new Float32Array(uvs);
    const colorData = new Float32Array(colors);

    device!.queue.writeBuffer(vertexBuffer!, 0, positionData);
    device!.queue.writeBuffer(vertexBuffer!, positions.length * 4, uvData);
    device!.queue.writeBuffer(vertexBuffer!, (positions.length + uvs.length) * 4, colorData);

    indexBuffer = device!.createBuffer({
        size: indices.length * 4,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device!.queue.writeBuffer(indexBuffer!, 0, new Uint32Array(indices));

    // Create bind group
    bindGroup = device!.createBindGroup({
        layout: pipeline!.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer! } }],
    });
}

// Render frame
function render() {
    if (!device || !context || !pipeline || !vertexBuffer || !indexBuffer || !uniformBuffer || !bindGroup) return;

    // Update uniforms
    const uniformData = new Float32Array([
        camera.x, camera.y, camera.zoom, 0,
        canvas.width, canvas.height, 0, 0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.067, g: 0.067, b: 0.067, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        }],
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, 'uint32');
    passEncoder.drawIndexed(cards.length * 6);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    updateMinimap();
    requestAnimationFrame(render);
}

// Update minimap
function updateMinimap() {
    const miniWidth = 200;
    const miniHeight = 150;
    const scale = miniWidth / (cards.length > 0 ? Math.max(...cards.map(c => c.x + c.width)) + 100 : 1000);

    minimap.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: ${miniWidth}px;
        height: ${miniHeight}px;
        background: rgba(30, 30, 30, 0.9);
        border: 1px solid #444;
        border-radius: 4px;
        overflow: hidden;
    `;

    // Clear and redraw
    minimap.innerHTML = '';

    // Draw cards
    cards.forEach(card => {
        const div = document.createElement('div');
        div.style.cssText = `
            position: absolute;
            left: ${card.x * scale}px;
            top: ${card.y * scale}px;
            width: ${card.width * scale}px;
            height: ${card.height * scale}px;
            background: rgba(${card.color[0] * 255}, ${card.color[1] * 255}, ${card.color[2] * 255}, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.3);
        `;
        minimap.appendChild(div);
    });

    // Draw viewport
    const viewportWidth = (canvas.width / camera.zoom) * scale;
    const viewportHeight = (canvas.height / camera.zoom) * scale;
    const viewportX = (-camera.x / camera.zoom) * scale;
    const viewportY = (-camera.y / camera.zoom) * scale;

    const viewport = document.createElement('div');
    viewport.style.cssText = `
        position: absolute;
        left: ${viewportX}px;
        top: ${viewportY}px;
        width: ${viewportWidth}px;
        height: ${viewportHeight}px;
        border: 2px solid #fff;
        background: rgba(255, 255, 255, 0.1);
        pointer-events: none;
    `;
    minimap.appendChild(viewport);
}

// Resize handler
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Mouse handlers
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * delta));

    // Zoom towards mouse position
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    camera.x = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
    camera.y = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
});

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        camera.x += e.clientX - lastMouse.x;
        camera.y += e.clientY - lastMouse.y;
        lastMouse = { x: e.clientX, y: e.clientY };
    }
});

canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });

// Minimap click to navigate
minimap.addEventListener('click', (e) => {
    const rect = minimap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const miniWidth = 200;
    const miniHeight = 150;
    const scale = miniWidth / (cards.length > 0 ? Math.max(...cards.map(c => c.x + c.width)) + 100 : 1000);

    camera.x = -(x / scale) * camera.zoom + canvas.width / 2;
    camera.y = -(y / scale) * camera.zoom + canvas.height / 2;
});

// Folder input handler
folderInput.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const fileList = target.files;

    if (!fileList || fileList.length === 0) return;

    files = Array.from(fileList).map(f => f.name);
    cards = layoutCards(files);

    info.textContent = `${files.length} files loaded`;

    if (device) {
        buildGeometry();
    }
});

// Initialize
async function init() {
    resize();
    window.addEventListener('resize', resize);

    const initialized = await initWebGPU();
    if (initialized) {
        render();
    }
}

init();
