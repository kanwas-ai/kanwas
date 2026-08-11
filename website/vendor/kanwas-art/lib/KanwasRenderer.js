// KanwasRenderer — WebGL2 generative fabric folds, packaged as an ES module
// Refactored from render-gl.js + knobs.js for use as a library

// ─── Default knob values ───

export const KNOB_DEFAULTS = {
  angle: 1.03,
  frequency: 0.02,
  frequency2: 0.059,
  amplitude2: 0.02,
  ampMod: 0,
  warpAmount: 40,
  warpScale: 0.0009,
  sCurveAmount: 70,
  sCurveFreq: 0.0027,
  heightScale: 1290,
  lightAngleH: -0.4,
  lightAngleV: -0.05,
  rimLight: 0,
  translucency: 0,
  blueR: 0,
  blueG: 135,
  blueB: 255,
  orangeR: 255,
  orangeG: 137,
  orangeB: 20,
  hueShift: 0,
  colorSpread: 3,
  bloomThreshold: 0.2,
  bloomStrength: 0.7,
  grainIntensity: 15,
  vignette: 0,
  warmth: 0,
  chromaAberr: 0,
  seed: 256,
}

// ─── Shader sources ───

const VERT_SRC = `#version 300 es
precision highp float;
void main() {
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`

const HEIGHT_FRAG_SRC = `#version 300 es
precision highp float;
out float fragHeight;

uniform vec2 u_resolution;
uniform float u_cosAngle, u_sinAngle;
uniform float u_frequency, u_frequency2, u_amplitude2;
uniform float u_warpAmount, u_warpScale;
uniform float u_sCurveAmount, u_sCurveFreq;
uniform float u_seed, u_time;
uniform vec2 u_mouse;
uniform float u_mouseForce, u_mouseWarp, u_mouseRipple, u_mouseWind;
uniform vec2 u_mouseVel;
uniform float u_ampMod;

vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float snoiseSeeded(vec2 v) { return snoise(v + u_seed * 1.31); }

float fbm(vec2 p, int octaves, float lac, float gain) {
  float val = 0.0, amp = 1.0, maxVal = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    val += amp * snoiseSeeded(p);
    maxVal += amp;
    amp *= gain;
    p *= lac;
  }
  return val / maxVal;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 mousePos = u_mouse * u_resolution;
  vec2 delta = mousePos - px;
  float mdist = length(delta);
  float gauss = exp(-mdist * mdist / (250.0 * 250.0));
  px += delta * gauss * u_mouseForce * u_mouseWarp;
  float windFade = exp(-mdist * mdist / (300.0 * 300.0)) * u_mouseWind * abs(u_mouseForce);
  px += u_mouseVel * windFade * 400.0;
  float u = px.x * u_cosAngle + px.y * u_sinAngle;
  float v = -px.x * u_sinAngle + px.y * u_cosAngle;
  u += sin(v * u_sCurveFreq + u_time * 0.1) * u_sCurveAmount;
  float warp = fbm(px * u_warpScale, 2, 2.0, 0.4);
  u += warp * u_warpAmount;
  float h1 = sin(u * u_frequency + u_time * 0.3);
  h1 *= 1.0 - u_ampMod * 0.5 * (1.0 - fbm(px * 0.001, 2, 2.0, 0.5));
  float h2 = sin(u * u_frequency2 + 1.0 + u_time * 0.2) * u_amplitude2;
  float raw = h1 + h2;
  float maxRange = 1.0 + u_amplitude2;
  float height01 = (raw + maxRange) / (2.0 * maxRange);
  float ripple = sin(mdist * 0.06 - u_time * 5.0) * exp(-mdist / 300.0);
  height01 += ripple * abs(u_mouseForce) * u_mouseRipple * 0.12;
  fragHeight = clamp(height01, 0.0, 1.0);
}
`

const SHADE_COLOR_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_heightTex;
uniform vec2 u_resolution;
uniform float u_heightScale;
uniform vec3 u_lightDir;
uniform vec3 u_blueVivid, u_orangeVivid;
uniform float u_cosAngle, u_sinAngle;
uniform float u_hueShift, u_colorSpread;
uniform float u_rimLight, u_translucency;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_resolution;
  float hc = texture(u_heightTex, uv).r;
  float hr = texture(u_heightTex, (px + vec2(1.0, 0.0)) / u_resolution).r;
  float hd = texture(u_heightTex, (px + vec2(0.0, 1.0)) / u_resolution).r;
  float dhdx = (hr - hc) * u_heightScale;
  float dhdy = (hd - hc) * u_heightScale;
  vec3 N = normalize(vec3(-dhdx, -dhdy, 1.0));
  float ndotl = dot(N, u_lightDir);
  float wrapDiffuse = ndotl * 0.4 + 0.6;
  vec3 H = normalize(u_lightDir + vec3(0.0, 0.0, 1.0));
  float ndoth = dot(N, H);
  float specular = pow(max(0.0, ndoth), 40.0) * 0.4;
  float rim = pow(1.0 - max(0.0, N.z), 3.0) * u_rimLight * 0.5;
  float sss = max(0.0, -ndotl) * (1.0 - hc) * u_translucency * 0.6;
  float valleyDark = pow(max(0.0, 1.0 - hc * 3.0), 3.0);
  float brightness = wrapDiffuse + specular + rim + sss;
  brightness *= (1.0 - valleyDark * 0.9);
  brightness = clamp(brightness, 0.0, 1.0);
  float slopeU = dhdx * u_cosAngle + dhdy * u_sinAngle;
  float normalizedSlope = tanh(slopeU * 0.15);
  float spatialShift = texture(u_heightTex, uv + vec2(0.3, 0.2)).r * 2.0 - 1.0;
  float raw = normalizedSlope + spatialShift * 0.5 + 0.1;
  float t = 1.0 / (1.0 + exp(-raw * u_colorSpread));
  vec3 baseColor = mix(u_orangeVivid, u_blueVivid, t);
  if (u_hueShift > 0.0) {
    vec3 hsv = rgb2hsv(baseColor);
    hsv.x = fract(hsv.x + hc * u_hueShift);
    baseColor = hsv2rgb(hsv);
  }
  fragColor = vec4(baseColor, brightness);
}
`

const BLUR_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_src;
uniform vec2 u_direction;
uniform vec2 u_srcSize;

void main() {
  vec2 uv = gl_FragCoord.xy / u_srcSize;
  vec2 step = u_direction / u_srcSize;
  vec4 sum = texture(u_src, uv) * 0.13702;
  sum += (texture(u_src, uv + step * 1.4585) + texture(u_src, uv - step * 1.4585)) * 0.23931;
  sum += (texture(u_src, uv + step * 3.4041) + texture(u_src, uv - step * 3.4041)) * 0.13943;
  sum += (texture(u_src, uv + step * 5.3517) + texture(u_src, uv - step * 5.3517)) * 0.05271;
  fragColor = sum;
}
`

const COMPOSITE_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_colorBrightTex;
uniform sampler2D u_blurredTex;
uniform sampler2D u_heightTex;
uniform vec2 u_resolution;

const vec3 valleyColor = vec3(4.0/255.0, 4.0/255.0, 18.0/255.0);

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec4 cb = texture(u_colorBrightTex, uv);
  vec3 baseColor = cb.rgb;
  float brightness = cb.a;
  vec3 blurred = texture(u_blurredTex, uv).rgb;
  float h = texture(u_heightTex, uv).r;
  float valleyness = pow(max(0.0, 1.0 - h * 2.5), 2.0);
  float bleedMix = valleyness * 0.7;
  vec3 mixed = mix(baseColor, blurred, bleedMix);
  vec3 composed = mix(valleyColor, mixed, brightness);
  fragColor = vec4(composed, brightness);
}
`

const BLOOM_EXTRACT_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_composedTex;
uniform sampler2D u_colorBrightTex;
uniform vec2 u_resolution;
uniform float u_bloomThreshold;

void main() {
  vec2 uv = gl_FragCoord.xy / (u_resolution * 0.125);
  vec4 composed = texture(u_composedTex, uv);
  float brightness = texture(u_colorBrightTex, uv).a;
  if (brightness > u_bloomThreshold) {
    float factor = (brightness - u_bloomThreshold) / (1.0 - u_bloomThreshold);
    fragColor = vec4(composed.rgb * factor, 1.0);
  } else {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}
`

const FINAL_FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_composedTex;
uniform sampler2D u_bloomTex;
uniform vec2 u_resolution;
uniform float u_bloomStrength;
uniform float u_grainIntensity;
uniform float u_time;
uniform float u_vignette;
uniform float u_warmth;
uniform float u_chromaAberr;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 composed, bloom;
  if (u_chromaAberr > 0.0) {
    vec2 caDir = (uv - 0.5) * u_chromaAberr / max(u_resolution.x, u_resolution.y);
    composed = vec3(
      texture(u_composedTex, uv + caDir).r,
      texture(u_composedTex, uv).g,
      texture(u_composedTex, uv - caDir).b);
    bloom = vec3(
      texture(u_bloomTex, uv + caDir).r,
      texture(u_bloomTex, uv).g,
      texture(u_bloomTex, uv - caDir).b);
  } else {
    composed = texture(u_composedTex, uv).rgb;
    bloom = texture(u_bloomTex, uv).rgb;
  }
  vec3 color = composed + bloom * u_bloomStrength;
  color.r *= 1.0 + u_warmth * 0.15;
  color.b *= 1.0 - u_warmth * 0.15;
  vec2 vigUV = uv - 0.5;
  color *= max(0.0, 1.0 - dot(vigUV, vigUV) * u_vignette * 2.0);
  float timeHash = floor(u_time * 24.0);
  vec2 px = gl_FragCoord.xy;
  float g1 = hash(floor(px / 1.0) + timeHash) * 2.0 - 1.0;
  float g2 = hash(floor(px / 2.0) + timeHash * 1.3) * 2.0 - 1.0;
  float g4 = hash(floor(px / 4.0) + timeHash * 1.7) * 2.0 - 1.0;
  float grain = (g1 * 0.45 + g2 * 0.35 + g4 * 0.2) * u_grainIntensity / 255.0;
  color += grain;
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

// ─── Performance tiers ───

const TIER_ANIMATED = 'animated'
const TIER_STATIC = 'static'

// ─── Renderer class ───

export class KanwasRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config
   * @param {object} config.knobs — Knob values (merged over KNOB_DEFAULTS)
   * @param {number} [config.time=0] — Initial time offset
   * @param {boolean} [config.animate=true] — Whether to animate
   * @param {number} [config.targetFps=50] — Target FPS for adaptive quality
   * @param {number} [config.minScale=0.15] — Minimum render scale (adaptive floor)
   * @param {number} [config.maxPixelRatio=2] — Cap device pixel ratio
   * @param {function} [config.onTierChange] — Called when performance tier changes
   */
  constructor(canvas, config = {}) {
    this.canvas = canvas
    this.gl = null

    // Config
    this._animate = config.animate !== false
    this._targetFps = config.targetFps || 50
    this._minScale = config.minScale || 0.15
    this._maxPixelRatio = config.maxPixelRatio || 2
    this._onTierChange = config.onTierChange || null

    // Knob values
    this._knobs = { ...KNOB_DEFAULTS, ...(config.knobs || {}) }

    // Computed uniforms (derived from knobs)
    this._uniforms = {}
    this._computeUniforms()

    // Time
    this._time = config.time || 0
    this._lastTime = 0
    this._animSpeed = 1.0

    // Render state
    this._programs = {}
    this._textures = {}
    this._fbos = {}
    this._vao = null
    this._w = 0
    this._h = 0
    this._displayW = 0
    this._displayH = 0
    this._hasFloatFBO = false
    this._quarterSize = [0, 0]
    this._eighthSize = [0, 0]

    // Mouse
    this._mouse = [0.5, 0.5]
    this._mouseTarget = [0.5, 0.5]
    this._mouseForce = 1.0
    this._mouseVel = [0, 0]
    this._mousePrev = [0.5, 0.5]
    this._mouseWarp = 1
    this._mouseWind = 1
    this._mouseRipple = 0

    // Adaptive quality
    this._qualityScale = 1.0
    this._adaptFrames = 0
    this._adaptLastCheck = 0
    this._adaptSettled = false

    // Performance tier
    this._tier = TIER_ANIMATED
    this._lowFpsStart = 0 // timestamp when FPS first dropped critically
    this._staticFallbackDelay = 3 // seconds of low FPS before going static

    // Animation loop
    this._rafId = null
    this._paused = false
    this._started = false
    this._destroyed = false

    // Observers
    this._resizeObserver = null
    this._visibilityHandler = null
  }

  // ─── Public API ───

  /** Initialize WebGL and start rendering. Returns false if WebGL2 is unavailable. */
  start() {
    if (this._started || this._destroyed) return false
    this._started = true

    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false })
    if (!this.gl) {
      // WebGL2 not available — render a single static frame is not possible,
      // signal the consumer via tier change
      this._setTier(TIER_STATIC)
      return false
    }

    const gl = this.gl
    this._hasFloatFBO = !!gl.getExtension('EXT_color_buffer_float')

    // Compile shaders
    this._programs.height = this._createProgram(VERT_SRC, HEIGHT_FRAG_SRC)
    this._programs.shadeColor = this._createProgram(VERT_SRC, SHADE_COLOR_FRAG_SRC)
    this._programs.blur = this._createProgram(VERT_SRC, BLUR_FRAG_SRC)
    this._programs.composite = this._createProgram(VERT_SRC, COMPOSITE_FRAG_SRC)
    this._programs.bloomExtract = this._createProgram(VERT_SRC, BLOOM_EXTRACT_FRAG_SRC)
    this._programs.final = this._createProgram(VERT_SRC, FINAL_FRAG_SRC)

    this._vao = gl.createVertexArray()

    // Initial sizing from the canvas's container
    this._measureAndResize()

    // Mouse interaction (offsetX/Y are in CSS pixels, use canvas CSS size)
    this.canvas.addEventListener(
      'mousemove',
      (this._onMouseMove = (e) => {
        const rect = this.canvas.getBoundingClientRect()
        this._mouseTarget = [e.offsetX / rect.width, 1 - e.offsetY / rect.height]
      })
    )
    this.canvas.addEventListener(
      'mouseleave',
      (this._onMouseLeave = () => {
        this._mouseTarget = [0.5, 0.5]
      })
    )

    // Pause when tab is hidden (saves battery)
    this._visibilityHandler = () => {
      this._paused = document.hidden
      if (!this._paused) {
        this._lastTime = performance.now() / 1000
        this._adaptLastCheck = this._lastTime
        this._adaptFrames = 0
      }
    }
    document.addEventListener('visibilitychange', this._visibilityHandler)

    // ResizeObserver on the canvas's parent
    if (this.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(() => this._measureAndResize())
      this._resizeObserver.observe(this.canvas.parentElement)
    }

    // Start animation loop
    this._lastTime = performance.now() / 1000
    this._adaptLastCheck = this._lastTime
    if (this._animate) {
      this._loop(performance.now())
    } else {
      // Static mode: draw once at the configured time
      this.draw()
      this._setTier(TIER_STATIC)
    }

    return true
  }

  /** Stop the animation loop (can be resumed with resume()). */
  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  /** Resume animation after stop(). */
  resume() {
    if (!this._started || this._destroyed || this._rafId) return
    this._lastTime = performance.now() / 1000
    this._adaptLastCheck = this._lastTime
    this._adaptFrames = 0
    this._loop(performance.now())
  }

  /** Clean up all resources. Instance cannot be reused after this. */
  destroy() {
    this._destroyed = true
    this.stop()

    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler)
      this._visibilityHandler = null
    }
    if (this._onMouseMove) {
      this.canvas.removeEventListener('mousemove', this._onMouseMove)
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave)
    }

    const gl = this.gl
    if (gl) {
      for (const key of Object.keys(this._fbos)) gl.deleteFramebuffer(this._fbos[key])
      for (const key of Object.keys(this._textures)) gl.deleteTexture(this._textures[key])
      for (const key of Object.keys(this._programs)) gl.deleteProgram(this._programs[key])
      if (this._vao) gl.deleteVertexArray(this._vao)
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    }

    this._fbos = {}
    this._textures = {}
    this._programs = {}
    this.gl = null
  }

  /** Update knob values. Partial updates are merged. */
  setKnobs(knobs) {
    Object.assign(this._knobs, knobs)
    this._computeUniforms()
  }

  /** Set the time value (for frozen frames or scrubbing). */
  setTime(t) {
    this._time = t
  }

  /** Manually trigger a resize to match the container. */
  resize() {
    this._measureAndResize()
  }

  /** Current performance tier: 'animated' or 'static'. */
  get tier() {
    return this._tier
  }

  /** Current adaptive quality scale (0–1). */
  get qualityScale() {
    return this._qualityScale
  }

  // ─── Internals: knobs → uniforms ───

  _computeUniforms() {
    const k = this._knobs
    const lH = k.lightAngleH
    const lV = k.lightAngleV
    const lx = Math.sin(lH)
    const ly = Math.sin(lV)
    const lz = 1
    const len = Math.sqrt(lx * lx + ly * ly + lz * lz)

    this._uniforms = {
      cosAngle: Math.cos(k.angle),
      sinAngle: Math.sin(k.angle),
      frequency: k.frequency,
      frequency2: k.frequency2,
      amplitude2: k.amplitude2,
      warpAmount: k.warpAmount,
      warpScale: k.warpScale,
      sCurveAmount: k.sCurveAmount,
      sCurveFreq: k.sCurveFreq,
      heightScale: k.heightScale,
      lightDir: [lx / len, ly / len, lz / len],
      blueVivid: [k.blueR / 255, k.blueG / 255, k.blueB / 255],
      orangeVivid: [k.orangeR / 255, k.orangeG / 255, k.orangeB / 255],
      seed: k.seed,
      ampMod: k.ampMod,
      bloomThreshold: k.bloomThreshold,
      bloomStrength: k.bloomStrength,
      grainIntensity: k.grainIntensity,
      hueShift: k.hueShift,
      colorSpread: k.colorSpread,
      rimLight: k.rimLight,
      translucency: k.translucency,
      vignette: k.vignette,
      warmth: k.warmth,
      chromaAberr: k.chromaAberr,
    }
  }

  // ─── Internals: sizing ───

  _measureAndResize() {
    const parent = this.canvas.parentElement
    if (!parent) return

    const rect = parent.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, this._maxPixelRatio)
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)

    if (w === 0 || h === 0) return
    if (w === this._displayW && h === this._displayH) return

    this._displayW = w
    this._displayH = h

    // CSS size fills container; render resolution is decoupled
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'

    // Reset adaptive quality on resize
    this._adaptSettled = false
    this._adaptFrames = 0
    this._adaptLastCheck = performance.now() / 1000
    this._applyScale()
  }

  _applyScale() {
    const s = this._qualityScale
    const w = Math.max(64, Math.round(this._displayW * s))
    const h = Math.max(64, Math.round(this._displayH * s))
    if (w === this._w && h === this._h) return
    this.canvas.width = w
    this.canvas.height = h
    this._w = w
    this._h = h
    this._createAllFBOs()
  }

  // ─── Internals: FBO management ───

  _createAllFBOs() {
    const gl = this.gl
    if (!gl) return
    const w = this._w
    const h = this._h

    for (const key of Object.keys(this._fbos)) gl.deleteFramebuffer(this._fbos[key])
    for (const key of Object.keys(this._textures)) gl.deleteTexture(this._textures[key])

    const qw = Math.ceil(w / 4)
    const qh = Math.ceil(h / 4)
    const ew = Math.ceil(w / 8)
    const eh = Math.ceil(h / 8)

    if (this._hasFloatFBO) {
      this._createFBO('height', w, h, gl.R16F, gl.RED, gl.HALF_FLOAT)
    } else {
      this._createFBO('height', w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE)
    }

    this._createFBO('colorBright', w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    this._createFBO('blurA', qw, qh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    this._createFBO('blurB', qw, qh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    this._createFBO('composed', w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    this._createFBO('bloomA', ew, eh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
    this._createFBO('bloomB', ew, eh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)

    this._quarterSize = [qw, qh]
    this._eighthSize = [ew, eh]
  }

  _createFBO(name, w, h, internalFormat, format, type) {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

    this._textures[name] = tex
    this._fbos[name] = fbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ─── Internals: drawing ───

  draw() {
    const gl = this.gl
    if (!gl) return
    const w = this._w
    const h = this._h
    const u = this._uniforms
    const [qw, qh] = this._quarterSize
    const [ew, eh] = this._eighthSize

    gl.bindVertexArray(this._vao)
    const mf = this._mouseForce * 0.2

    // Pass 1: Height map
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.height)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._programs.height)
    this._setUniforms(this._programs.height, {
      u_resolution: [w, h],
      u_cosAngle: u.cosAngle,
      u_sinAngle: u.sinAngle,
      u_frequency: u.frequency,
      u_frequency2: u.frequency2,
      u_amplitude2: u.amplitude2,
      u_warpAmount: u.warpAmount,
      u_warpScale: u.warpScale,
      u_sCurveAmount: u.sCurveAmount,
      u_sCurveFreq: u.sCurveFreq,
      u_seed: u.seed,
      u_time: this._time,
      u_mouse: this._mouse,
      u_mouseForce: mf,
      u_mouseWarp: this._mouseWarp,
      u_mouseRipple: this._mouseRipple,
      u_mouseWind: this._mouseWind,
      u_mouseVel: this._mouseVel,
      u_ampMod: u.ampMod,
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: Shade + color
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.colorBright)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._programs.shadeColor)
    this._bindTexture(this._programs.shadeColor, 'u_heightTex', this._textures.height, 0)
    this._setUniforms(this._programs.shadeColor, {
      u_resolution: [w, h],
      u_heightScale: u.heightScale,
      u_lightDir: u.lightDir,
      u_blueVivid: u.blueVivid,
      u_orangeVivid: u.orangeVivid,
      u_cosAngle: u.cosAngle,
      u_sinAngle: u.sinAngle,
      u_hueShift: u.hueShift,
      u_colorSpread: u.colorSpread,
      u_rimLight: u.rimLight,
      u_translucency: u.translucency,
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Passes 3–6: Color blur (4 passes at 1/4 size)
    gl.useProgram(this._programs.blur)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.blurA)
    gl.viewport(0, 0, qw, qh)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.colorBright, 0)
    this._setUniforms(this._programs.blur, { u_direction: [1, 0], u_srcSize: [qw, qh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.blurB)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.blurA, 0)
    this._setUniforms(this._programs.blur, { u_direction: [0, 1], u_srcSize: [qw, qh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.blurA)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.blurB, 0)
    this._setUniforms(this._programs.blur, { u_direction: [1, 0], u_srcSize: [qw, qh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.blurB)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.blurA, 0)
    this._setUniforms(this._programs.blur, { u_direction: [0, 1], u_srcSize: [qw, qh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 7: Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.composed)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._programs.composite)
    this._bindTexture(this._programs.composite, 'u_colorBrightTex', this._textures.colorBright, 0)
    this._bindTexture(this._programs.composite, 'u_blurredTex', this._textures.blurB, 1)
    this._bindTexture(this._programs.composite, 'u_heightTex', this._textures.height, 2)
    this._setUniforms(this._programs.composite, { u_resolution: [w, h] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 8: Bloom extract
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.bloomA)
    gl.viewport(0, 0, ew, eh)
    gl.useProgram(this._programs.bloomExtract)
    this._bindTexture(this._programs.bloomExtract, 'u_composedTex', this._textures.composed, 0)
    this._bindTexture(this._programs.bloomExtract, 'u_colorBrightTex', this._textures.colorBright, 1)
    this._setUniforms(this._programs.bloomExtract, {
      u_resolution: [w, h],
      u_bloomThreshold: u.bloomThreshold,
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Passes 9–12: Bloom blur (4 passes at 1/8 size)
    gl.useProgram(this._programs.blur)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.bloomB)
    gl.viewport(0, 0, ew, eh)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.bloomA, 0)
    this._setUniforms(this._programs.blur, { u_direction: [1, 0], u_srcSize: [ew, eh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.bloomA)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.bloomB, 0)
    this._setUniforms(this._programs.blur, { u_direction: [0, 1], u_srcSize: [ew, eh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.bloomB)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.bloomA, 0)
    this._setUniforms(this._programs.blur, { u_direction: [1, 0], u_srcSize: [ew, eh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos.bloomA)
    this._bindTexture(this._programs.blur, 'u_src', this._textures.bloomB, 0)
    this._setUniforms(this._programs.blur, { u_direction: [0, 1], u_srcSize: [ew, eh] })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 13: Final composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._programs.final)
    this._bindTexture(this._programs.final, 'u_composedTex', this._textures.composed, 0)
    this._bindTexture(this._programs.final, 'u_bloomTex', this._textures.bloomA, 1)
    this._setUniforms(this._programs.final, {
      u_resolution: [w, h],
      u_bloomStrength: u.bloomStrength,
      u_grainIntensity: u.grainIntensity,
      u_time: this._time,
      u_vignette: u.vignette,
      u_warmth: u.warmth,
      u_chromaAberr: u.chromaAberr,
    })
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindVertexArray(null)
  }

  // ─── Internals: animation loop ───

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t))
    if (this._paused) return

    const nowSec = now / 1000
    const dt = Math.min(nowSec - this._lastTime, 0.1)
    this._lastTime = nowSec

    if (this._animate) {
      this._time += dt * this._animSpeed
    }

    // Smooth mouse lerp
    const k = 1 - Math.exp(-5 * dt)
    this._mouse[0] += (this._mouseTarget[0] - this._mouse[0]) * k
    this._mouse[1] += (this._mouseTarget[1] - this._mouse[1]) * k
    const invDt = 1 / Math.max(dt, 0.001)
    const vx = (this._mouse[0] - this._mousePrev[0]) * invDt
    const vy = (this._mouse[1] - this._mousePrev[1]) * invDt
    this._mouseVel[0] += (vx - this._mouseVel[0]) * k
    this._mouseVel[1] += (vy - this._mouseVel[1]) * k
    this._mousePrev[0] = this._mouse[0]
    this._mousePrev[1] = this._mouse[1]

    this.draw()

    // Adaptive quality
    if (!this._adaptSettled) {
      this._adaptFrames++
      const adaptElapsed = nowSec - this._adaptLastCheck
      if (adaptElapsed >= 1.0) {
        const fps = this._adaptFrames / adaptElapsed
        this._adaptFrames = 0
        this._adaptLastCheck = nowSec

        if (fps < this._targetFps * 0.85) {
          this._qualityScale = Math.max(this._minScale, this._qualityScale * 0.65)
          this._applyScale()
        } else if (fps < this._targetFps && this._qualityScale > this._minScale) {
          this._qualityScale = Math.max(this._minScale, this._qualityScale * 0.85)
          this._applyScale()
        } else if (fps > this._targetFps * 1.2 && this._qualityScale < 1.0) {
          this._qualityScale = Math.min(1.0, this._qualityScale * 1.12)
          this._applyScale()
        } else {
          this._adaptSettled = true
        }

        // Performance tier: if FPS is critically low even at min scale, go static
        if (fps < 15 && this._qualityScale <= this._minScale) {
          if (this._lowFpsStart === 0) {
            this._lowFpsStart = nowSec
          } else if (nowSec - this._lowFpsStart > this._staticFallbackDelay) {
            this._goStatic()
          }
        } else {
          this._lowFpsStart = 0
        }
      }
    }
  }

  _goStatic() {
    // Freeze on current frame — still looks good, zero GPU cost
    this.draw()
    this.stop()
    this._setTier(TIER_STATIC)
  }

  _setTier(tier) {
    if (tier === this._tier) return
    this._tier = tier
    if (this._onTierChange) this._onTierChange(tier)
  }

  // ─── Internals: GL helpers ───

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl
    const vs = this._compileShader(gl.VERTEX_SHADER, vertSrc)
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fragSrc)
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('KanwasRenderer: link error', gl.getProgramInfoLog(prog))
      return null
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    prog._uniforms = {}
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i)
      prog._uniforms[info.name] = gl.getUniformLocation(prog, info.name)
    }
    return prog
  }

  _compileShader(type, src) {
    const gl = this.gl
    const shader = gl.createShader(type)
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('KanwasRenderer: shader compile error', gl.getShaderInfoLog(shader))
    }
    return shader
  }

  _setUniforms(prog, uniforms) {
    const gl = this.gl
    for (const [name, val] of Object.entries(uniforms)) {
      const loc = prog._uniforms[name]
      if (loc === undefined || loc === null) continue
      if (Array.isArray(val)) {
        if (val.length === 2) gl.uniform2fv(loc, val)
        else if (val.length === 3) gl.uniform3fv(loc, val)
        else if (val.length === 4) gl.uniform4fv(loc, val)
      } else {
        gl.uniform1f(loc, val)
      }
    }
  }

  _bindTexture(prog, name, tex, unit) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const loc = prog._uniforms[name]
    if (loc !== undefined && loc !== null) {
      gl.uniform1i(loc, unit)
    }
  }
}
