uniform float uFresnelPower;
uniform float uFresnelStrength;
uniform vec3 uFresnelColor;

void main() {
  csm_FragNormal = normalize(vNormal);

  // Fresnel based on view-space normal & view direction.
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, uFresnelPower) * uFresnelStrength;

  // Brighten at grazing angles (sphere-like rim light)
  csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, uFresnelColor, clamp(fresnel, 0.0, 1.0));
}


