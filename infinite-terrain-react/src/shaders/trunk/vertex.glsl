varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
}


