uniform float uTime;
uniform float uWiggleStrength;
uniform float uWiggleSpeed;
uniform float uWorldNoiseScale;
uniform float uUvWiggleScale;
uniform sampler2D uNoiseTexture;
uniform float uNoiseMix;
varying vec3 vWorldPosition;

float csm_noiseTex(vec2 p) {
  return texture2D(uNoiseTexture, p).r;
}

void main() {
  // Sphere-like normal transfer: treat bush origin as sphere center (object-space)
  vec3 fromCenter = position;
  float len = length(fromCenter);
  csm_Normal = (len > 1e-5) ? (fromCenter / len) : normal;

  // Wiggle (world + UV noise, blended)
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  float t = uTime * uWiggleSpeed;

  float nWorld = csm_noiseTex(worldPos.xz * uWorldNoiseScale + vec2(t, t * 0.73));
  float nUv = csm_noiseTex(uv * uUvWiggleScale + vec2(-t * 0.41, t * 0.29));

  float wWorld = nWorld * 2.0 - 1.0;
  float wUv = nUv * 2.0 - 1.0;
  float wiggle = mix(wWorld, wUv, clamp(uNoiseMix, 0.0, 1.0));

  csm_Position = position + normal * wiggle * uWiggleStrength;
  vWorldPosition = (modelMatrix * vec4(csm_Position, 1.0)).xyz;
}


