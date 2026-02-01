varying vec2 vUv;

uniform vec3 uTrunkColorA;
uniform vec3 uTrunkColorB;

void main() {
  float m = step(0.5, vUv.y);
  csm_DiffuseColor.rgb = mix(uTrunkColorA, uTrunkColorB, m);
}


