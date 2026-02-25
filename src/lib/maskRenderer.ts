import type maplibregl from "maplibre-gl";
import type { PolygonRings } from "./geo";
import {
  buildClipVertices,
  prepareMaskPolygons,
  type PreparedMaskPolygon,
} from "./maskGeometry";

export type MaskRendererOptions = {
  map: maplibregl.Map;
  normalContainer: HTMLElement;
  maskCanvas: HTMLCanvasElement;
  getPolygons: () => PolygonRings[];
  minRenderIntervalMs?: number;
};

export class MaskRenderer {
  private readonly map: maplibregl.Map;
  private readonly normalContainer: HTMLElement;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly getPolygons: () => PolygonRings[];
  private readonly featherCanvas: HTMLCanvasElement;
  private readonly featherCtx: CanvasRenderingContext2D | null;
  private gl: WebGLRenderingContext | null = null;
  private glProgram: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private positionAttribLocation = -1;
  private pendingFrame: number | null = null;
  private pendingFeather = false;
  private lastSignature = "";
  private readonly minRenderIntervalMs: number;
  private lastRenderTs = 0;
  private readonly preparedByPolygons = new WeakMap<PolygonRings[], PreparedMaskPolygon[]>();
  private readonly polygonSetIds = new WeakMap<PolygonRings[], number>();
  private nextPolygonSetId = 1;

  constructor(options: MaskRendererOptions) {
    this.map = options.map;
    this.normalContainer = options.normalContainer;
    this.maskCanvas = options.maskCanvas;
    this.getPolygons = options.getPolygons;
    this.minRenderIntervalMs = options.minRenderIntervalMs ?? 34;
    this.featherCanvas = document.createElement("canvas");
    this.featherCtx = this.featherCanvas.getContext("2d");
    this.init();
  }

  schedule(withFeather = false) {
    this.pendingFeather = this.pendingFeather || withFeather;
    if (this.pendingFrame != null) {
      return;
    }
    const run = (now: number) => {
      this.pendingFrame = null;
      if (!this.pendingFeather && now - this.lastRenderTs < this.minRenderIntervalMs) {
        this.pendingFrame = window.requestAnimationFrame(run);
        return;
      }
      const shouldFeather = this.pendingFeather;
      this.pendingFeather = false;
      this.render(shouldFeather);
      this.lastRenderTs = now;
    };
    this.pendingFrame = window.requestAnimationFrame(run);
  }

  render(withFeather: boolean) {
    if (!this.gl || !this.glProgram || !this.positionBuffer || this.positionAttribLocation < 0) {
      return;
    }
    const widthCss = this.normalContainer.clientWidth;
    const heightCss = this.normalContainer.clientHeight;
    if (widthCss < 2 || heightCss < 2) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const widthPixels = Math.max(1, Math.floor(widthCss * dpr));
    const heightPixels = Math.max(1, Math.floor(heightCss * dpr));
    if (this.maskCanvas.width !== widthPixels || this.maskCanvas.height !== heightPixels) {
      this.maskCanvas.width = widthPixels;
      this.maskCanvas.height = heightPixels;
      this.featherCanvas.width = widthPixels;
      this.featherCanvas.height = heightPixels;
    }

    const polygons = this.getPolygons();
    const polygonSetId = this.getPolygonSetId(polygons);
    const center = this.map.getCenter();
    const signature = [
      widthPixels,
      heightPixels,
      polygonSetId,
      center.lng.toFixed(5),
      center.lat.toFixed(5),
      this.map.getZoom().toFixed(4),
      this.map.getBearing().toFixed(2),
      this.map.getPitch().toFixed(2),
      withFeather ? "f" : "n",
    ].join("|");
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;

    const preparedPolygons = this.getPreparedPolygons(polygons);
    const clipVertices = buildClipVertices(
      preparedPolygons,
      (lon, lat) => this.map.project([lon, lat]),
      widthPixels,
      heightPixels,
      dpr,
    );

    this.gl.viewport(0, 0, widthPixels, heightPixels);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (!clipVertices.length) {
      this.normalContainer.style.maskImage = "none";
      this.normalContainer.style.webkitMaskImage = "none";
      return;
    }

    this.gl.useProgram(this.glProgram);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, clipVertices, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(this.positionAttribLocation);
    this.gl.vertexAttribPointer(this.positionAttribLocation, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, clipVertices.length / 2);

    let sourceCanvas: HTMLCanvasElement = this.maskCanvas;
    if (withFeather && this.featherCtx) {
      this.featherCtx.clearRect(0, 0, widthPixels, heightPixels);
      this.featherCtx.filter = "blur(1.75px)";
      this.featherCtx.drawImage(this.maskCanvas, 0, 0, widthPixels, heightPixels);
      this.featherCtx.filter = "none";
      sourceCanvas = this.featherCanvas;
    }
    const maskUrl = sourceCanvas.toDataURL("image/png");
    this.normalContainer.style.maskImage = `url("${maskUrl}")`;
    this.normalContainer.style.maskSize = "100% 100%";
    this.normalContainer.style.maskRepeat = "no-repeat";
    this.normalContainer.style.maskPosition = "center";
    this.normalContainer.style.webkitMaskImage = `url("${maskUrl}")`;
    this.normalContainer.style.webkitMaskSize = "100% 100%";
    this.normalContainer.style.webkitMaskRepeat = "no-repeat";
    this.normalContainer.style.webkitMaskPosition = "center";
  }

  destroy() {
    if (this.pendingFrame != null) {
      window.cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }
    if (this.gl && this.positionBuffer) {
      this.gl.deleteBuffer(this.positionBuffer);
    }
    if (this.gl && this.glProgram) {
      this.gl.deleteProgram(this.glProgram);
    }
    this.normalContainer.style.maskImage = "none";
    this.normalContainer.style.webkitMaskImage = "none";
    this.lastSignature = "";
  }

  private init() {
    this.gl = this.maskCanvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!this.gl) {
      return;
    }

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    const fragmentShaderSource = `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `;

    const createShader = (type: number, source: string) => {
      if (!this.gl) {
        return null;
      }
      const shader = this.gl.createShader(type);
      if (!shader) {
        return null;
      }
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        this.gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) {
      return;
    }

    this.glProgram = this.gl.createProgram();
    if (!this.glProgram) {
      return;
    }
    this.gl.attachShader(this.glProgram, vertexShader);
    this.gl.attachShader(this.glProgram, fragmentShader);
    this.gl.linkProgram(this.glProgram);
    if (!this.gl.getProgramParameter(this.glProgram, this.gl.LINK_STATUS)) {
      this.gl.deleteProgram(this.glProgram);
      this.glProgram = null;
      return;
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    this.positionBuffer = this.gl.createBuffer();
    this.positionAttribLocation = this.gl.getAttribLocation(this.glProgram, "a_position");
  }

  private getPreparedPolygons(polygons: PolygonRings[]): PreparedMaskPolygon[] {
    const cached = this.preparedByPolygons.get(polygons);
    if (cached) {
      return cached;
    }
    const prepared = prepareMaskPolygons(polygons);
    this.preparedByPolygons.set(polygons, prepared);
    return prepared;
  }

  private getPolygonSetId(polygons: PolygonRings[]): number {
    const cached = this.polygonSetIds.get(polygons);
    if (cached != null) {
      return cached;
    }
    const id = this.nextPolygonSetId;
    this.nextPolygonSetId += 1;
    this.polygonSetIds.set(polygons, id);
    return id;
  }
}
